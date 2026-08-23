import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MethodologyAdminService } from "../../src/application/methodology-admin-service.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for methodology administration integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const service = new MethodologyAdminService(pool);
const valuationService = new ValuationService(repository);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE security_audit_events, organization_memberships,
      gold_standard_evidence, gold_standard_decisions, gold_standard_cases,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

function definition(code: string, version = "1.0") {
  const value = structuredClone(demoMethodology);
  value.code = code;
  value.name = `${code} Methodology`;
  value.version = version;
  return value;
}

describe("methodology administration persistence", () => {
  it("previews, imports and exposes an organization methodology for new valuations", async () => {
    const organization = await repository.createOrganization({
      slug: "methodology-a",
      name: "Methodology A",
      currencyCode: "PEN",
    });
    const input = definition("ACME_POINT_FACTOR");

    const preview = await service.preview(organization.id, input);
    expect(preview.status).toBe("VALID");
    expect(preview.duplicate).toBe(false);

    const imported = await service.importActive(
      organization.id,
      input,
      "ACME internal authorized content",
    );
    expect(imported.status).toBe("ACTIVE");
    expect(imported.organizationId).toBe(organization.id);
    expect(imported.contentOwner).toBe("ACME internal authorized content");

    const available = await service.listAvailable(organization.id, { activeOnly: true });
    expect(available.map((item) => item.id)).toContain(imported.id);

    const job = await repository.createJob(organization.id, { name: "Jefatura de Finanzas" });
    const valuation = await valuationService.startValuation(organization.id, job.id, imported.id);
    expect(valuation.methodologyVersionId).toBe(imported.id);
  });

  it("rejects duplicate organization code/version without overwriting the first version", async () => {
    const organization = await repository.createOrganization({
      slug: "methodology-duplicate",
      name: "Methodology Duplicate",
      currencyCode: "PEN",
    });
    const input = definition("DUPLICATE_METHOD");
    const first = await service.importActive(organization.id, input, "Authorized source A");

    const preview = await service.preview(organization.id, input);
    expect(preview.status).toBe("INVALID");
    expect(preview.duplicate).toBe(true);
    expect(preview.issues.map((issue) => issue.code)).toContain("METHODOLOGY_VERSION_EXISTS");

    await expect(service.importActive(organization.id, input, "Authorized source B"))
      .rejects.toMatchObject({ code: "METHODOLOGY_VERSION_EXISTS" });

    const rows = await pool.query(
      "SELECT id, content_owner FROM methodology_versions WHERE organization_id = $1",
      [organization.id],
    );
    expect(rows.rows).toEqual([{ id: first.id, content_owner: "Authorized source A" }]);
  });

  it("isolates organization-owned methodologies between tenants", async () => {
    const organizationA = await repository.createOrganization({
      slug: "methodology-tenant-a",
      name: "Methodology Tenant A",
      currencyCode: "PEN",
    });
    const organizationB = await repository.createOrganization({
      slug: "methodology-tenant-b",
      name: "Methodology Tenant B",
      currencyCode: "PEN",
    });
    const imported = await service.importActive(
      organizationA.id,
      definition("TENANT_A_ONLY"),
      "Tenant A",
    );

    const visibleToB = await service.listAvailable(organizationB.id);
    expect(visibleToB.map((item) => item.id)).not.toContain(imported.id);
    expect(await repository.getMethodologyVersionForOrganization(organizationB.id, imported.id)).toBeNull();
  });

  it("enforces published methodology immutability at the database boundary", async () => {
    const organization = await repository.createOrganization({
      slug: "methodology-immutable",
      name: "Methodology Immutable",
      currencyCode: "PEN",
    });
    const imported = await service.importActive(
      organization.id,
      definition("IMMUTABLE_METHOD"),
      "Authorized methodology owner",
    );

    await expect(
      pool.query("UPDATE methodology_versions SET name = 'Changed' WHERE id = $1", [imported.id]),
    ).rejects.toThrow(/immutable/i);
    await expect(
      pool.query("DELETE FROM methodology_versions WHERE id = $1", [imported.id]),
    ).rejects.toThrow(/cannot be deleted/i);

    await pool.query("UPDATE methodology_versions SET status = 'RETIRED' WHERE id = $1", [imported.id]);
    await expect(
      pool.query("UPDATE methodology_versions SET status = 'ACTIVE' WHERE id = $1", [imported.id]),
    ).rejects.toThrow(/cannot be reactivated/i);
  });

  it("serializes concurrent imports so only one copy of a version is created", async () => {
    const organization = await repository.createOrganization({
      slug: "methodology-concurrent",
      name: "Methodology Concurrent",
      currencyCode: "PEN",
    });
    const input = definition("CONCURRENT_METHOD");

    const results = await Promise.allSettled([
      service.importActive(organization.id, input, "Authorized source"),
      service.importActive(organization.id, input, "Authorized source"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const count = await pool.query(
      "SELECT count(*)::int AS count FROM methodology_versions WHERE organization_id = $1 AND code = $2 AND version = $3",
      [organization.id, input.code, input.version],
    );
    expect(count.rows[0]?.count).toBe(1);
  });
});
