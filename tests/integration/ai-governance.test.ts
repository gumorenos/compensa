import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AIGovernanceError,
  AIGovernanceService,
} from "../../src/application/ai-governance-service.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for AI governance integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const service = new AIGovernanceService(pool);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE ai_assistance_settings, security_audit_events, organization_memberships,
      auth_sessions, auth_accounts, auth_verifications, auth_users, organizations
      RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

async function createActor(name = "Tenant admin"): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO auth_users (id, name, email, email_verified)
     VALUES ($1, $2, $3, true)`,
    [id, name, `${id}@example.com`],
  );
  return id;
}

describe("AI tenant governance", () => {
  it("defaults to fully disabled without manufacturing a settings row", async () => {
    const organization = await repository.createOrganization({
      slug: "ai-default-off",
      name: "Default Off",
      currencyCode: "PEN",
    });

    await expect(service.getSettings(organization.id)).resolves.toEqual({
      organizationId: organization.id,
      assistanceEnabled: false,
      externalProcessingAllowed: false,
      updatedByUserId: null,
      updatedAt: null,
    });
    const count = await pool.query(
      `SELECT count(*)::int AS count FROM ai_assistance_settings WHERE organization_id = $1`,
      [organization.id],
    );
    expect(count.rows[0]!.count).toBe(0);
  });

  it("persists tenant opt-in and security audit atomically with the human actor", async () => {
    const organization = await repository.createOrganization({
      slug: "ai-opt-in",
      name: "AI Opt In",
      currencyCode: "PEN",
    });
    const actorId = await createActor();

    const saved = await service.updateSettings(organization.id, actorId, {
      assistanceEnabled: true,
      externalProcessingAllowed: false,
    });

    expect(saved).toMatchObject({
      organizationId: organization.id,
      assistanceEnabled: true,
      externalProcessingAllowed: false,
      updatedByUserId: actorId,
    });
    expect(saved.updatedAt).toBeInstanceOf(Date);

    const audit = await pool.query(
      `SELECT actor_user_id, action, resource_type, resource_id, payload
       FROM security_audit_events
       WHERE organization_id = $1 AND action = 'AI_ASSISTANCE_SETTINGS_UPDATED'`,
      [organization.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      actor_user_id: actorId,
      action: "AI_ASSISTANCE_SETTINGS_UPDATED",
      resource_type: "ORGANIZATION",
      resource_id: organization.id,
      payload: {
        assistanceEnabled: true,
        externalProcessingAllowed: false,
      },
    });
  });

  it("isolates settings by tenant and never falls back to another organization's opt-in", async () => {
    const organizationA = await repository.createOrganization({
      slug: "ai-tenant-a",
      name: "Tenant A",
      currencyCode: "PEN",
    });
    const organizationB = await repository.createOrganization({
      slug: "ai-tenant-b",
      name: "Tenant B",
      currencyCode: "PEN",
    });
    const actorId = await createActor();

    await service.updateSettings(organizationA.id, actorId, {
      assistanceEnabled: true,
      externalProcessingAllowed: true,
    });

    await expect(service.getSettings(organizationA.id)).resolves.toMatchObject({
      assistanceEnabled: true,
      externalProcessingAllowed: true,
    });
    await expect(service.getSettings(organizationB.id)).resolves.toMatchObject({
      organizationId: organizationB.id,
      assistanceEnabled: false,
      externalProcessingAllowed: false,
      updatedByUserId: null,
    });
  });

  it("rejects contradictory consent in the service and at the PostgreSQL boundary", async () => {
    const organization = await repository.createOrganization({
      slug: "ai-invalid-consent",
      name: "Invalid Consent",
      currencyCode: "PEN",
    });
    const actorId = await createActor();

    await expect(
      service.updateSettings(organization.id, actorId, {
        assistanceEnabled: false,
        externalProcessingAllowed: true,
      }),
    ).rejects.toBeInstanceOf(AIGovernanceError);

    await expect(
      pool.query(
        `INSERT INTO ai_assistance_settings
          (organization_id, assistance_enabled, external_processing_allowed, updated_by_user_id)
         VALUES ($1, false, true, $2)`,
        [organization.id, actorId],
      ),
    ).rejects.toThrow(/ai_assistance_settings.*check|violates check constraint/i);

    expect(await service.getSettings(organization.id)).toMatchObject({
      assistanceEnabled: false,
      externalProcessingAllowed: false,
    });
  });

  it("disabling assistance also supports explicit revocation of external processing", async () => {
    const organization = await repository.createOrganization({
      slug: "ai-revoke",
      name: "Revoke Tenant",
      currencyCode: "PEN",
    });
    const actorId = await createActor();

    await service.updateSettings(organization.id, actorId, {
      assistanceEnabled: true,
      externalProcessingAllowed: true,
    });
    const disabled = await service.updateSettings(organization.id, actorId, {
      assistanceEnabled: false,
      externalProcessingAllowed: false,
    });

    expect(disabled).toMatchObject({
      assistanceEnabled: false,
      externalProcessingAllowed: false,
    });
    const audits = await pool.query(
      `SELECT payload FROM security_audit_events
       WHERE organization_id = $1 AND action = 'AI_ASSISTANCE_SETTINGS_UPDATED'
       ORDER BY created_at, id`,
      [organization.id],
    );
    expect(audits.rows).toHaveLength(2);
    expect(audits.rows[1]!.payload).toEqual({
      assistanceEnabled: false,
      externalProcessingAllowed: false,
    });
  });

  it("does not leave settings behind when the actor is invalid", async () => {
    const organization = await repository.createOrganization({
      slug: "ai-invalid-actor",
      name: "Invalid Actor",
      currencyCode: "PEN",
    });

    await expect(
      service.updateSettings(organization.id, randomUUID(), {
        assistanceEnabled: true,
        externalProcessingAllowed: false,
      }),
    ).rejects.toThrow();

    const count = await pool.query(
      `SELECT count(*)::int AS count FROM ai_assistance_settings WHERE organization_id = $1`,
      [organization.id],
    );
    expect(count.rows[0]!.count).toBe(0);
  });
});
