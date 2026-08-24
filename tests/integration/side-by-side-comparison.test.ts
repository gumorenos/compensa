import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SideBySideComparisonService } from "../../src/application/side-by-side-comparison.js";
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
  throw new Error("DATABASE_URL is required for side-by-side comparison integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);
const comparison = new SideBySideComparisonService(pool);

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
  approved = true,
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
  if (approved) {
    await repository.updateValuationStatus(organizationId, valuation.id, "APPROVED");
  }
  return (await repository.getValuation(organizationId, valuation.id))!;
}

describe("Side-by-side comparison persistence boundary", () => {
  it("returns only selected approved valuations from one tenant and preserves requested order", async () => {
    const organizationA = await repository.createOrganization({
      slug: "side-by-side-a",
      name: "Side by Side A",
      currencyCode: "PEN",
    });
    const organizationB = await repository.createOrganization({
      slug: "side-by-side-b",
      name: "Side by Side B",
      currencyCode: "PEN",
    });
    const methodologyA = await repository.createMethodologyVersion({
      organizationId: organizationA.id,
      definition: demoMethodology,
      contentOwner: "Side by Side A",
      status: "ACTIVE",
    });
    const methodologyB = await repository.createMethodologyVersion({
      organizationId: organizationB.id,
      definition: demoMethodology,
      contentOwner: "Side by Side B",
      status: "ACTIVE",
    });

    const jobA1 = await repository.createJob(organizationA.id, { name: "A Uno" });
    const jobA2 = await repository.createJob(organizationA.id, { name: "A Dos" });
    const jobADraft = await repository.createJob(organizationA.id, { name: "A Draft" });
    const jobB = await repository.createJob(organizationB.id, { name: "B Foreign" });

    const first = await completeValuation(organizationA.id, jobA1.id, methodologyA.id);
    const second = await completeValuation(
      organizationA.id,
      jobA2.id,
      methodologyA.id,
      { DOMAIN_KNOWLEDGE: "K3" },
    );
    const draft = await completeValuation(
      organizationA.id,
      jobADraft.id,
      methodologyA.id,
      {},
      false,
    );
    const foreign = await completeValuation(organizationB.id, jobB.id, methodologyB.id);

    const report = await comparison.getReport(organizationA.id, [second.id, first.id]);
    expect(report.valuations.map((valuation) => valuation.valuationId)).toEqual([second.id, first.id]);
    expect(report.dimensions.find((row) => row.dimensionCode === "DOMAIN_KNOWLEDGE")?.comparison).toBe("DIFFERENT");

    await expect(comparison.getReport(organizationA.id, [first.id, draft.id])).rejects.toMatchObject({
      code: "VALUATION_NOT_AVAILABLE",
    });
    await expect(comparison.getReport(organizationA.id, [first.id, foreign.id])).rejects.toMatchObject({
      code: "VALUATION_NOT_AVAILABLE",
    });
  });

  it("rejects malformed valuation IDs before PostgreSQL UUID casting", async () => {
    const organization = await repository.createOrganization({
      slug: "side-by-side-malformed",
      name: "Side by Side Malformed",
      currencyCode: "PEN",
    });

    await expect(
      comparison.getReport(organization.id, [
        "not-a-uuid",
        "00000000-0000-0000-0000-000000000001",
      ]),
    ).rejects.toMatchObject({ code: "VALUATION_NOT_AVAILABLE" });
  });

  it("rejects two approved valuations from different methodology versions in the same tenant", async () => {
    const organization = await repository.createOrganization({
      slug: "side-by-side-methods",
      name: "Side by Side Methods",
      currencyCode: "PEN",
    });
    const methodologyOne = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Side by Side Methods",
      status: "ACTIVE",
    });
    const methodologyTwo = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: { ...demoMethodology, version: "2.0.0" },
      contentOwner: "Side by Side Methods",
      status: "ACTIVE",
    });
    const jobOne = await repository.createJob(organization.id, { name: "Version One" });
    const jobTwo = await repository.createJob(organization.id, { name: "Version Two" });
    const first = await completeValuation(organization.id, jobOne.id, methodologyOne.id);
    const second = await completeValuation(organization.id, jobTwo.id, methodologyTwo.id);

    await expect(comparison.getReport(organization.id, [first.id, second.id])).rejects.toMatchObject({
      code: "METHODOLOGY_VERSION_MISMATCH",
    });
  });

  it("deduplicates repeated IDs before enforcing the 2-to-5 boundary", async () => {
    const organization = await repository.createOrganization({
      slug: "side-by-side-duplicates",
      name: "Side by Side Duplicates",
      currencyCode: "PEN",
    });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Side by Side Duplicates",
      status: "ACTIVE",
    });
    const job = await repository.createJob(organization.id, { name: "Only One" });
    const valuation = await completeValuation(organization.id, job.id, methodology.id);

    await expect(comparison.getReport(organization.id, [valuation.id, valuation.id])).rejects.toMatchObject({
      code: "INVALID_SELECTION_COUNT",
    });
  });
});
