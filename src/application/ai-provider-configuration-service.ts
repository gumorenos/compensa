import type { Pool } from "pg";

export interface AIProviderConfiguration {
  organizationId: string;
  providerId: string;
  modelId: string;
  credentialReference: string;
  updatedByUserId: string;
  updatedAt: Date;
}

export interface SaveAIProviderConfigurationInput {
  providerId: string;
  modelId: string;
  credentialReference: string;
}

export class AIProviderConfigurationError extends Error {
  constructor(
    public readonly code:
      | "ORGANIZATION_NOT_FOUND"
      | "INVALID_PROVIDER_CONFIGURATION",
    message: string,
  ) {
    super(message);
    this.name = "AIProviderConfigurationError";
  }
}

interface ProviderConfigurationRow {
  organization_id: string;
  provider_id: string;
  model_id: string;
  credential_reference: string;
  updated_by_user_id: string;
  updated_at: Date;
}

const PROVIDER_ID_MAX = 80;
const MODEL_ID_MAX = 240;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const CREDENTIAL_REFERENCE_PATTERN =
  /^COMPENSA_AI_CREDENTIAL_[A-Z0-9_]{1,80}$/;

/**
 * Stores provider metadata only.
 *
 * credentialReference is a server-side secret reference name, never the secret
 * value itself. This service intentionally does not resolve credentials, create
 * provider adapters, test connectivity or perform network requests.
 */
export class AIProviderConfigurationService {
  constructor(private readonly pool: Pool) {}

  async getConfiguration(
    organizationId: string,
  ): Promise<AIProviderConfiguration | null> {
    const result = await this.pool.query(
      `SELECT organization_id, provider_id, model_id, credential_reference,
              updated_by_user_id, updated_at
       FROM ai_provider_configurations
       WHERE organization_id = $1`,
      [organizationId],
    );
    const row = result.rows[0] as ProviderConfigurationRow | undefined;
    return row === undefined ? null : mapConfiguration(row);
  }

  async saveConfiguration(
    organizationId: string,
    actorUserId: string,
    input: SaveAIProviderConfigurationInput,
  ): Promise<AIProviderConfiguration> {
    const normalized = validateConfiguration(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await requireActiveOrganization(client, organizationId);

      const result = await client.query(
        `INSERT INTO ai_provider_configurations
          (organization_id, provider_id, model_id, credential_reference, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id) DO UPDATE
         SET provider_id = EXCLUDED.provider_id,
             model_id = EXCLUDED.model_id,
             credential_reference = EXCLUDED.credential_reference,
             updated_by_user_id = EXCLUDED.updated_by_user_id,
             updated_at = now()
         RETURNING organization_id, provider_id, model_id, credential_reference,
                   updated_by_user_id, updated_at`,
        [
          organizationId,
          normalized.providerId,
          normalized.modelId,
          normalized.credentialReference,
          actorUserId,
        ],
      );

      const saved = mapConfiguration(result.rows[0] as ProviderConfigurationRow);
      await client.query(
        `INSERT INTO security_audit_events
          (organization_id, actor_user_id, action, resource_type, resource_id, payload)
         VALUES ($1, $2, 'AI_PROVIDER_CONFIGURATION_UPDATED', 'ORGANIZATION', $5,
           jsonb_build_object(
             'providerId', $3::text,
             'modelId', $4::text,
             'credentialReferenceConfigured', true
           ))`,
        [
          organizationId,
          actorUserId,
          saved.providerId,
          saved.modelId,
          organizationId,
        ],
      );

      await client.query("COMMIT");
      return saved;
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async clearConfiguration(
    organizationId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await requireActiveOrganization(client, organizationId);

      const deleted = await client.query(
        `DELETE FROM ai_provider_configurations
         WHERE organization_id = $1
         RETURNING provider_id, model_id`,
        [organizationId],
      );

      if (deleted.rows.length > 0) {
        await client.query(
          `INSERT INTO security_audit_events
            (organization_id, actor_user_id, action, resource_type, resource_id, payload)
           VALUES ($1, $2, 'AI_PROVIDER_CONFIGURATION_CLEARED', 'ORGANIZATION', $3,
             jsonb_build_object('configured', false))`,
          [organizationId, actorUserId, organizationId],
        );
      }

      await client.query("COMMIT");
      return deleted.rows.length > 0;
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

function validateConfiguration(
  input: SaveAIProviderConfigurationInput,
): SaveAIProviderConfigurationInput {
  const providerId = input.providerId.trim();
  const modelId = input.modelId.trim();
  const credentialReference = input.credentialReference.trim();

  if (
    !PROVIDER_ID_PATTERN.test(providerId) ||
    providerId.length > PROVIDER_ID_MAX ||
    modelId === "" ||
    modelId.length > MODEL_ID_MAX ||
    /[\u0000-\u001f\u007f]/.test(modelId) ||
    !CREDENTIAL_REFERENCE_PATTERN.test(credentialReference)
  ) {
    throw new AIProviderConfigurationError(
      "INVALID_PROVIDER_CONFIGURATION",
      "Provider metadata or credential reference is invalid.",
    );
  }

  return { providerId, modelId, credentialReference };
}

async function requireActiveOrganization(
  client: { query: Pool["query"] },
  organizationId: string,
): Promise<void> {
  const organization = await client.query(
    `SELECT id
     FROM organizations
     WHERE id = $1 AND status = 'ACTIVE'
     FOR UPDATE`,
    [organizationId],
  );
  if (organization.rows.length === 0) {
    throw new AIProviderConfigurationError(
      "ORGANIZATION_NOT_FOUND",
      "The active organization is not available.",
    );
  }
}

function mapConfiguration(
  row: ProviderConfigurationRow,
): AIProviderConfiguration {
  return {
    organizationId: row.organization_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    credentialReference: row.credential_reference,
    updatedByUserId: row.updated_by_user_id,
    updatedAt: row.updated_at,
  };
}

async function safeRollback(
  client: { query: Pool["query"] },
): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}
