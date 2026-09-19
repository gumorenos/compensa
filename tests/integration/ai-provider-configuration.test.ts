import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AIProviderConfigurationError,
  AIProviderConfigurationService,
} from "../../src/application/ai-provider-configuration-service.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for AI provider configuration integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const service = new AIProviderConfigurationService(pool);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE ai_provider_configurations, security_audit_events, organization_memberships,
      auth_sessions, auth_accounts, auth_verifications, auth_users, organizations
      RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

async function createActor(): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO auth_users (id, name, email, email_verified)
     VALUES ($1, 'Provider admin', $2, true)`,
    [id, `${id}@example.com`],
  );
  return id;
}

describe("AI provider configuration metadata", () => {
  it("defaults to no configuration and does not manufacture a row", async () => {
    const organization = await repository.createOrganization({
      slug: "provider-default",
      name: "Provider Default",
      currencyCode: "PEN",
    });

    await expect(service.getConfiguration(organization.id)).resolves.toBeNull();
    const count = await pool.query(
      "SELECT count(*)::int AS count FROM ai_provider_configurations WHERE organization_id = $1",
      [organization.id],
    );
    expect(count.rows[0]!.count).toBe(0);
  });

  it("stores only provider metadata and audits without the credential reference", async () => {
    const organization = await repository.createOrganization({
      slug: "provider-save",
      name: "Provider Save",
      currencyCode: "PEN",
    });
    const actorId = await createActor();

    const saved = await service.saveConfiguration(organization.id, actorId, {
      providerId: "openai",
      modelId: "gpt-5",
      credentialReference: "COMPENSA_AI_CREDENTIAL_PRIMARY",
    });

    expect(saved).toMatchObject({
      organizationId: organization.id,
      providerId: "openai",
      modelId: "gpt-5",
      credentialReference: "COMPENSA_AI_CREDENTIAL_PRIMARY",
      updatedByUserId: actorId,
    });
    expect(saved.updatedAt).toBeInstanceOf(Date);

    const audit = await pool.query(
      `SELECT actor_user_id, action, resource_type, resource_id, payload
       FROM security_audit_events
       WHERE organization_id = $1 AND action = 'AI_PROVIDER_CONFIGURATION_UPDATED'`,
      [organization.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      actor_user_id: actorId,
      resource_type: "ORGANIZATION",
      resource_id: organization.id,
      payload: {
        providerId: "openai",
        modelId: "gpt-5",
        credentialReferenceConfigured: true,
      },
    });
    const payload = JSON.stringify(audit.rows[0]!.payload);
    expect(payload).not.toContain("COMPENSA_AI_CREDENTIAL_PRIMARY");
    expect(payload).not.toContain("apiKey");
  });

  it("isolates provider metadata by organization", async () => {
    const organizationA = await repository.createOrganization({
      slug: "provider-a",
      name: "Provider A",
      currencyCode: "PEN",
    });
    const organizationB = await repository.createOrganization({
      slug: "provider-b",
      name: "Provider B",
      currencyCode: "PEN",
    });
    const actorId = await createActor();

    await service.saveConfiguration(organizationA.id, actorId, {
      providerId: "anthropic",
      modelId: "claude-example",
      credentialReference: "COMPENSA_AI_CREDENTIAL_A",
    });

    await expect(service.getConfiguration(organizationA.id)).resolves.toMatchObject({
      providerId: "anthropic",
      modelId: "claude-example",
    });
    await expect(service.getConfiguration(organizationB.id)).resolves.toBeNull();
  });

  it("rejects secret values and invalid references at service and PostgreSQL boundaries", async () => {
    const organization = await repository.createOrganization({
      slug: "provider-invalid",
      name: "Provider Invalid",
      currencyCode: "PEN",
    });
    const actorId = await createActor();

    await expect(
      service.saveConfiguration(organization.id, actorId, {
        providerId: "openai",
        modelId: "gpt-5",
        credentialReference: "sk-not-a-reference",
      }),
    ).rejects.toBeInstanceOf(AIProviderConfigurationError);

    await expect(
      pool.query(
        `INSERT INTO ai_provider_configurations
          (organization_id, provider_id, model_id, credential_reference, updated_by_user_id)
         VALUES ($1, 'openai', 'gpt-5', 'sk-not-a-reference', $2)`,
        [organization.id, actorId],
      ),
    ).rejects.toThrow(/ai_provider_configurations.*check|violates check constraint/i);

    await expect(service.getConfiguration(organization.id)).resolves.toBeNull();
  });

  it("clears metadata atomically and records the human actor", async () => {
    const organization = await repository.createOrganization({
      slug: "provider-clear",
      name: "Provider Clear",
      currencyCode: "PEN",
    });
    const actorId = await createActor();

    await service.saveConfiguration(organization.id, actorId, {
      providerId: "openai",
      modelId: "gpt-5",
      credentialReference: "COMPENSA_AI_CREDENTIAL_PRIMARY",
    });
    await expect(service.clearConfiguration(organization.id, actorId)).resolves.toBe(true);
    await expect(service.getConfiguration(organization.id)).resolves.toBeNull();
    await expect(service.clearConfiguration(organization.id, actorId)).resolves.toBe(false);

    const audit = await pool.query(
      `SELECT action, actor_user_id, payload
       FROM security_audit_events
       WHERE organization_id = $1
         AND action IN ('AI_PROVIDER_CONFIGURATION_UPDATED', 'AI_PROVIDER_CONFIGURATION_CLEARED')
       ORDER BY created_at, id`,
      [organization.id],
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[1]).toMatchObject({
      action: "AI_PROVIDER_CONFIGURATION_CLEARED",
      actor_user_id: actorId,
      payload: { configured: false },
    });
  });

  it("rolls back configuration when the actor does not exist", async () => {
    const organization = await repository.createOrganization({
      slug: "provider-invalid-actor",
      name: "Provider Invalid Actor",
      currencyCode: "PEN",
    });

    await expect(
      service.saveConfiguration(organization.id, randomUUID(), {
        providerId: "openai",
        modelId: "gpt-5",
        credentialReference: "COMPENSA_AI_CREDENTIAL_PRIMARY",
      }),
    ).rejects.toThrow();

    await expect(service.getConfiguration(organization.id)).resolves.toBeNull();
  });
});
