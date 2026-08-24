import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InternalComparablesService } from "../../src/application/comparables-service.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import {
  demoMethodology,
  demoMidLevelSelections,
} from "../../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for comparables integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);
const comparables = new InternalComparablesService(pool);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await pool.end();
});

async function cleanDatabase(): Promise<void> {
  await pool.query(
    `TRUNCATE calibration_run_cases, calibration_runs,
      gold_standard_evidence, gold_standard_decisions, gold_standard_cases,
      security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
}

async function completeValuation(
  organizationId: string,
  jobId: string,
  methodologyVersionId: string,
  overrides: Record<string, string> = {},
  status: "APPROVED" | "DRAFT" = "APPROVED",
) {
  const valuation = await valuationService.startValuation(
    organizationId,
    jobId,
    methodologyVersionId,
  );
  for (const [dimensionCode, defaultLevel] of Object.entries(demoMidLevelSelections)) {
    await valuationService.saveDecision(organizationId, valuation.id, {
      dimensionCode,
      selectedLevelCode: overrides[dimensionCode] ?? defaultLevel,
      source: "MANUAL",
    });
  }
  const completed = await repository.getValuation(organizationId, valuation.id);
  if (completed === null || completed.totalPoints === null || completed.gradeCode === null) {
    throw new Error("Expected a complete valuation.");
  }
  if (status === "APPROVED") {
    await repository.updateValuationStatus(organizationId, valuation.id, "APPROVED");
  }
  return (await repository.getValuation(organizationId, valuation.id))!;
}

describe("Internal comparables persistence boundary", () => {
  it("uses only approved valuations from the tenant and exact methodology version", async () => {
    const organizationA = await repository.createOrganization({
      slug: "comparable-a",
      name: "Comparable A",
      currencyCode: "PEN",
    });
    const organizationB = await repository.createOrganization({
      slug: "comparable-b",
      name: "Comparable B",
      currencyCode: "PEN",
    });
    const methodologyA = await repository.createMethodologyVersion({
      organizationId: organizationA.id,
      definition: demoMethodology,
      contentOwner: "Comparable A",
      status: "ACTIVE",
    });
    const methodologyA2 = await repository.createMethodologyVersion({
      organizationId: organizationA.id,
      definition: { ...demoMethodology, version: "2.0.0" },
      contentOwner: "Comparable A",
      status: "ACTIVE",
    });
    const methodologyB = await repository.createMethodologyVersion({
      organizationId: organizationB.id,
      definition: demoMethodology,
      contentOwner: "Comparable B",
      status: "ACTIVE",
    });

    const baseJob = await repository.createJob(organizationA.id, {
      code: "A-BASE",
      name: "Jefe de Planeamiento",
      department: "Operaciones",
      jobFamily: "Operaciones",
    });
    const nearbyJob = await repository.createJob(organizationA.id, {
      code: "A-NEAR",
      name: "Jefe de Control",
      department: "Operaciones",
      jobFamily: "Operaciones",
    });
    const draftJob = await repository.createJob(organizationA.id, { name: "Borrador" });
    const otherMethodJob = await repository.createJob(organizationA.id, { name: "Otra versión" });
    const tenantBJob = await repository.createJob(organizationB.id, { name: "Otro tenant" });

    const base = await completeValuation(organizationA.id, baseJob.id, methodologyA.id);
    const nearby = await completeValuation(
      organizationA.id,
      nearbyJob.id,
      methodologyA.id,
      { DOMAIN_KNOWLEDGE: "K3" },
    );
    await completeValuation(organizationA.id, draftJob.id, methodologyA.id, {}, "DRAFT");
    await completeValuation(organizationA.id, otherMethodJob.id, methodologyA2.id);
    const foreign = await completeValuation(organizationB.id, tenantBJob.id, methodologyB.id);

    const approved = await comparables.listApprovedValuations(organizationA.id);
    expect(approved.map((item) => item.jobName)).toEqual([
      "Jefe de Control",
      "Jefe de Planeamiento",
      "Otra versión",
    ]);
    expect(JSON.stringify(approved)).not.toContain("Borrador");
    expect(JSON.stringify(approved)).not.toContain("Otro tenant");

    const report = await comparables.getReport(organizationA.id, base.id);
    expect(report).not.toBeNull();
    expect(report?.comparableCount).toBe(1);
    expect(report?.candidates[0]).toMatchObject({
      valuationId: nearby.id,
      pointDifference: 37,
      absolutePointDifference: 37,
      gradeDistance: 0,
      exactDimensionMatches: 5,
      totalLevelDistance: 1,
      sameJobFamily: true,
      sameDepartment: true,
    });
    expect(JSON.stringify(report)).not.toContain("Otra versión");
    expect(await comparables.getReport(organizationA.id, foreign.id)).toBeNull();
  });

  it("can compare an older approved version of the same job without hiding that relationship", async () => {
    const organization = await repository.createOrganization({
      slug: "history-comparable",
      name: "History Comparable",
      currencyCode: "PEN",
    });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "History Comparable",
      status: "ACTIVE",
    });
    const job = await repository.createJob(organization.id, {
      code: "H-1",
      name: "Puesto histórico",
      jobFamily: "Operaciones",
    });

    const first = await completeValuation(organization.id, job.id, methodology.id);
    const second = await completeValuation(
      organization.id,
      job.id,
      methodology.id,
      { AUTONOMY: "A3" },
    );

    const report = await comparables.getReport(organization.id, second.id);
    expect(report?.candidates).toHaveLength(1);
    expect(report?.candidates[0]).toMatchObject({
      valuationId: first.id,
      sameJob: true,
      valuationVersion: 1,
    });
  });
});
