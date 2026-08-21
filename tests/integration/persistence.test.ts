import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ValuationService, type ValuationSnapshot } from "../../src/application/valuation-service.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";
import {
  demoMethodology,
  demoMidLevelSelections,
} from "../../src/fixtures/demo-methodology.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for persistence integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const service = new ValuationService(repository);

beforeAll(async () => {
  await runMigrations(pool);
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL persistence", () => {
  it("applies migrations idempotently and records their checksum", async () => {
    const result = await pool.query(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );

    expect(result.rows).toHaveLength(4);
    expect(result.rows.map((row) => row.name)).toEqual([
      "0001_core.sql",
      "0002_descriptions_evidence_review.sql",
      "0003_auth_rbac_audit.sql",
      "0004_gold_standard.sql",
    ]);
    for (const row of result.rows) {
      expect(row.checksum).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("persists a complete valuation and recalculates the deterministic result", async () => {
    const organization = await repository.createOrganization({
      slug: "acme-pe",
      name: "ACME Peru",
      countryCode: "PE",
      currencyCode: "PEN",
    });
    const job = await repository.createJob(organization.id, {
      code: "FIN-001",
      name: "Jefe de Planeamiento",
      department: "Finanzas",
      jobFamily: "Finanzas",
    });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Compensa demo",
      status: "ACTIVE",
    });
    const valuation = await service.startValuation(
      organization.id,
      job.id,
      methodology.id,
    );

    let snapshot: ValuationSnapshot | null = null;
    const entries = Object.entries(demoMidLevelSelections);
    for (const [dimensionCode, selectedLevelCode] of entries) {
      snapshot = await service.saveDecision(organization.id, valuation.id, {
        dimensionCode,
        selectedLevelCode,
        source: "MANUAL",
      });
    }

    if (snapshot === null) throw new Error("Expected final valuation snapshot.");
    expect(snapshot.complete).toBe(true);
    expect(snapshot.valuation.totalPoints).toBe(231);
    expect(snapshot.valuation.gradeCode).toBe("G3");
    expect(snapshot.decisions).toHaveLength(6);
    expect(snapshot.scoring?.trace).toHaveLength(7);

    const reloaded = await service.getSnapshot(organization.id, valuation.id);
    expect(reloaded?.valuation.totalPoints).toBe(231);
    expect(reloaded?.valuation.gradeCode).toBe("G3");
    expect(reloaded?.decisions).toHaveLength(6);

    const events = await pool.query(
      "SELECT action FROM valuation_events WHERE valuation_id = $1 ORDER BY id",
      [valuation.id],
    );
    expect(events.rows.map((row) => row.action)).toEqual([
      "VALUATION_CREATED",
      "DECISION_SAVED",
      "DECISION_SAVED",
      "DECISION_SAVED",
      "DECISION_SAVED",
      "DECISION_SAVED",
      "DECISION_SAVED",
      "VALUATION_RECALCULATED",
    ]);
  });

  it("keeps a partial draft without manufacturing a provisional score", async () => {
    const organization = await repository.createOrganization({
      slug: "partial",
      name: "Partial Corp",
      currencyCode: "USD",
    });
    const job = await repository.createJob(organization.id, { name: "Analista" });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Compensa demo",
    });
    const valuation = await service.startValuation(
      organization.id,
      job.id,
      methodology.id,
    );

    const snapshot = await service.saveDecision(organization.id, valuation.id, {
      dimensionCode: "DOMAIN_KNOWLEDGE",
      selectedLevelCode: "K2",
    });

    expect(snapshot.complete).toBe(false);
    expect(snapshot.valuation.totalPoints).toBeNull();
    expect(snapshot.valuation.gradeCode).toBeNull();
    expect(snapshot.scoring).toBeNull();
  });

  it("isolates jobs and valuations between organizations", async () => {
    const organizationA = await repository.createOrganization({
      slug: "tenant-a",
      name: "Tenant A",
      currencyCode: "PEN",
    });
    const organizationB = await repository.createOrganization({
      slug: "tenant-b",
      name: "Tenant B",
      currencyCode: "PEN",
    });
    const jobA = await repository.createJob(organizationA.id, { name: "Gerente A" });
    const methodologyA = await repository.createMethodologyVersion({
      organizationId: organizationA.id,
      definition: demoMethodology,
      contentOwner: "Tenant A",
    });
    const valuationA = await service.startValuation(
      organizationA.id,
      jobA.id,
      methodologyA.id,
    );

    expect(await repository.getJob(organizationB.id, jobA.id)).toBeNull();
    expect(await repository.getValuation(organizationB.id, valuationA.id)).toBeNull();
    expect(await service.getSnapshot(organizationB.id, valuationA.id)).toBeNull();

    await expect(
      service.saveDecision(organizationB.id, valuationA.id, {
        dimensionCode: "DOMAIN_KNOWLEDGE",
        selectedLevelCode: "K2",
      }),
    ).rejects.toMatchObject({ code: "VALUATION_NOT_FOUND" });
  });

  it("allocates unique sequential valuation versions under concurrency", async () => {
    const organization = await repository.createOrganization({
      slug: "concurrency",
      name: "Concurrency Corp",
      currencyCode: "PEN",
    });
    const job = await repository.createJob(organization.id, { name: "Jefe" });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Compensa demo",
    });

    const [first, second] = await Promise.all([
      service.startValuation(organization.id, job.id, methodology.id),
      service.startValuation(organization.id, job.id, methodology.id),
    ]);

    expect([first.version, second.version].sort((left, right) => left - right)).toEqual([1, 2]);
  });

  it("allows a global methodology version to be consumed by multiple organizations", async () => {
    const organizationA = await repository.createOrganization({
      slug: "global-a",
      name: "Global A",
      currencyCode: "USD",
    });
    const organizationB = await repository.createOrganization({
      slug: "global-b",
      name: "Global B",
      currencyCode: "USD",
    });
    const globalMethodology = await repository.createMethodologyVersion({
      organizationId: null,
      definition: demoMethodology,
      contentOwner: "Compensa",
      status: "ACTIVE",
    });
    const jobA = await repository.createJob(organizationA.id, { name: "Puesto A" });
    const jobB = await repository.createJob(organizationB.id, { name: "Puesto B" });

    const valuationA = await service.startValuation(
      organizationA.id,
      jobA.id,
      globalMethodology.id,
    );
    const valuationB = await service.startValuation(
      organizationB.id,
      jobB.id,
      globalMethodology.id,
    );

    expect(valuationA.methodologyVersionId).toBe(globalMethodology.id);
    expect(valuationB.methodologyVersionId).toBe(globalMethodology.id);
  });

  it("rejects invalid methodology definitions before persistence", async () => {
    const organization = await repository.createOrganization({
      slug: "invalid-method",
      name: "Invalid Method Corp",
      currencyCode: "PEN",
    });
    const invalid = structuredClone(demoMethodology);
    const grade2 = invalid.grades.find((grade) => grade.code === "G2");
    if (grade2 === undefined) throw new Error("Demo fixture must contain G2.");
    grade2.minPoints = 100;

    await expect(
      repository.createMethodologyVersion({
        organizationId: organization.id,
        definition: invalid,
        contentOwner: "Test",
      }),
    ).rejects.toMatchObject({ code: "INVALID_METHODOLOGY" });
  });

  it("rolls back an invalid decision without leaving audit residue", async () => {
    const organization = await repository.createOrganization({
      slug: "rollback",
      name: "Rollback Corp",
      currencyCode: "PEN",
    });
    const job = await repository.createJob(organization.id, { name: "Analista" });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Compensa demo",
    });
    const valuation = await service.startValuation(
      organization.id,
      job.id,
      methodology.id,
    );

    await expect(
      service.saveDecision(organization.id, valuation.id, {
        dimensionCode: "AUTONOMY",
        selectedLevelCode: "NOT_A_LEVEL",
      }),
    ).rejects.toMatchObject({ code: "INVALID_LEVEL" });

    expect(await repository.listValuationDecisions(organization.id, valuation.id)).toEqual([]);
    const events = await pool.query(
      "SELECT action FROM valuation_events WHERE valuation_id = $1 ORDER BY id",
      [valuation.id],
    );
    expect(events.rows.map((row) => row.action)).toEqual(["VALUATION_CREATED"]);
  });
});
