import type { Pool } from "pg";

export interface AIAssistanceSettings {
  organizationId: string;
  assistanceEnabled: boolean;
  externalProcessingAllowed: boolean;
  updatedByUserId: string | null;
  updatedAt: Date | null;
}

export interface UpdateAIAssistanceSettingsInput {
  assistanceEnabled: boolean;
  externalProcessingAllowed: boolean;
}

export class AIGovernanceError extends Error {
  constructor(
    public readonly code: "ORGANIZATION_NOT_FOUND" | "INVALID_AI_SETTINGS",
    message: string,
  ) {
    super(message);
    this.name = "AIGovernanceError";
  }
}

interface SettingsRow {
  organization_id: string;
  assistance_enabled: boolean;
  external_processing_allowed: boolean;
  updated_by_user_id: string;
  updated_at: Date;
}

/**
 * Tenant-level governance for AI assistance.
 *
 * Absence of a row means fully disabled. Enabling this setting does not bind or
 * invoke a provider; external processing is a separate explicit consent bit for
 * the later provider-binding increment.
 */
export class AIGovernanceService {
  constructor(private readonly pool: Pool) {}

  async getSettings(organizationId: string): Promise<AIAssistanceSettings> {
    const result = await this.pool.query(
      `SELECT organization_id, assistance_enabled, external_processing_allowed,
              updated_by_user_id, updated_at
       FROM ai_assistance_settings
       WHERE organization_id = $1`,
      [organizationId],
    );
    const row = result.rows[0] as SettingsRow | undefined;
    if (row === undefined) {
      return {
        organizationId,
        assistanceEnabled: false,
        externalProcessingAllowed: false,
        updatedByUserId: null,
        updatedAt: null,
      };
    }
    return mapSettings(row);
  }

  async updateSettings(
    organizationId: string,
    actorUserId: string,
    input: UpdateAIAssistanceSettingsInput,
  ): Promise<AIAssistanceSettings> {
    if (!input.assistanceEnabled && input.externalProcessingAllowed) {
      throw new AIGovernanceError(
        "INVALID_AI_SETTINGS",
        "External processing cannot be allowed while AI assistance is disabled.",
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const organization = await client.query(
        `SELECT id FROM organizations WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`,
        [organizationId],
      );
      if (organization.rows.length === 0) {
        throw new AIGovernanceError(
          "ORGANIZATION_NOT_FOUND",
          "The active organization is not available.",
        );
      }

      const result = await client.query(
        `INSERT INTO ai_assistance_settings
          (organization_id, assistance_enabled, external_processing_allowed, updated_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id) DO UPDATE
         SET assistance_enabled = EXCLUDED.assistance_enabled,
             external_processing_allowed = EXCLUDED.external_processing_allowed,
             updated_by_user_id = EXCLUDED.updated_by_user_id,
             updated_at = now()
         RETURNING organization_id, assistance_enabled, external_processing_allowed,
                   updated_by_user_id, updated_at`,
        [
          organizationId,
          input.assistanceEnabled,
          input.externalProcessingAllowed,
          actorUserId,
        ],
      );
      const saved = mapSettings(result.rows[0] as SettingsRow);

      // Keep organization_id and resource_id as separate parameters even though
      // they carry the same value: the former is UUID while audit resource_id is text.
      // This avoids PostgreSQL inferring conflicting types for one placeholder.
      await client.query(
        `INSERT INTO security_audit_events
          (organization_id, actor_user_id, action, resource_type, resource_id, payload)
         VALUES ($1, $2, 'AI_ASSISTANCE_SETTINGS_UPDATED', 'ORGANIZATION', $5,
           jsonb_build_object(
             'assistanceEnabled', $3::boolean,
             'externalProcessingAllowed', $4::boolean
           ))`,
        [
          organizationId,
          actorUserId,
          saved.assistanceEnabled,
          saved.externalProcessingAllowed,
          organizationId,
        ],
      );

      await client.query("COMMIT");
      return saved;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

function mapSettings(row: SettingsRow): AIAssistanceSettings {
  return {
    organizationId: row.organization_id,
    assistanceEnabled: row.assistance_enabled,
    externalProcessingAllowed: row.external_processing_allowed,
    updatedByUserId: row.updated_by_user_id,
    updatedAt: row.updated_at,
  };
}
