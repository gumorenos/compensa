import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CalibrationService } from "../../src/application/calibration-service.js";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { demoMethodology, demoMidLevelSelections } from "../../src/fixtures/demo-methodology.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for calibration integration tests.");
}

const pool = createPool(databaseUrl);
const core = new CompensaRepository(pool);
const calibration = new CalibrationService(pool);
const gold = new GoldStandardService(pool);

beforeAll(async () => { await runMigrations(pool); });
beforeEach(async () => { await cleanDatabase(); });
afterAll(async () => { await cleanDatabase(); await pool.end(); });

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

async function setup(slug: string, partition: "CALIBRATION" | "HOLDOUT", caseCodes = ["GS-1", "GS-2"]) {
  const organization = await core.createOrganization({
    slug,
    name: `${slug} Corp`,
    countryCode: "PE",
    currencyCode: "PEN",
  });
  const methodology = await core.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa demo",
    status: "ACTIVE",
  });
  await gold.importHistoricalCases(organization.id, {
    version: 1,
    cases: caseCodes.map((caseCode) => ({
      caseCode,
      anonymizedLabel: `Referencia ${caseCode}`,
      methodologyVersionId: methodology.id,
      partition,
      job: {
        code: `JOB-${caseCode}`,
        name: `Puesto ${caseCode}`,
        department: "Operaciones",
        area: "Planeamiento",
        jobFamily: "Operaciones",
      },
      description: `Descriptivo anonimizado ${caseCode}`,
      decisions: Object.entries(demoMidLevelSelections).map(([dimensionCode, selectedLevelCode]) => ({
        dimensionCode,
        selectedLevelCode,
        justification: `Juicio experto ${dimensionCode}`,
      })),
      expectedTotalPoints: 231,
      expectedGradeCode: "G3",
    })),
  });
  return { organization, methodology };
}

describe("persisted calibration runs", () => {
  it("freezes eligible cases, accepts candidate selections and completes with aggregate metrics", async () => {
    const source = await setup("calibration-flow", "CALIBRATION");
    const created = await calibration.createRun(source.organization.id, {
      name: "Calibración manual 1",
      partition: "CALIBRATION",
      methodologyVersionId: source.methodology.id,
      candidateLabel: "Comité ciego",
    });

    expect(created.cases).toHaveLength(2);
    expect(created.run.status).toBe("DRAFT");

    await calibration.saveCandidate(
      source.organization.id,
      created.run.id,
      created.cases[0]!.caseId,
      demoMidLevelSelections,
    );
    const changed = { ...demoMidLevelSelections, AUTONOMY: "A3" };
    await calibration.saveCandidate(
      source.organization.id,
      created.run.id,
      created.cases[1]!.caseId,
      changed,
    );

    const live = await calibration.getRunView(source.organization.id, created.run.id);
    expect(live).not.toBeNull();
    expect(live!.evaluatedCount).toBe(2);
    expect(live!.liveSummary).not.toBeNull();
    expect(live!.liveSummary!.caseCount).toBe(2);
    expect(live!.liveSummary!.exactDimensionAgreementRate).toBeLessThan(1);
    expect(live!.deviations[0]!.caseId).toBe(created.cases[1]!.caseId);

    const completed = await calibration.completeRun(source.organization.id, created.run.id);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.summary?.caseCount).toBe(2);
    expect(completed.summary?.gradeMatchCount).toBeGreaterThanOrEqual(1);

    await expect(
      calibration.saveCandidate(
        source.organization.id,
        created.run.id,
        created.cases[0]!.caseId,
        demoMidLevelSelections,
      ),
    ).rejects.toMatchObject({ code: "CALIBRATION_RUN_COMPLETED" });
    await expect(
      pool.query("UPDATE calibration_runs SET name = 'Changed' WHERE id = $1", [created.run.id]),
    ).rejects.toThrow(/immutable/i);
  });

  it("refuses completion until every frozen case has a candidate", async () => {
    const source = await setup("calibration-incomplete", "CALIBRATION");
    const created = await calibration.createRun(source.organization.id, {
      name: "Incomplete",
      partition: "CALIBRATION",
      methodologyVersionId: source.methodology.id,
    });
    await calibration.saveCandidate(
      source.organization.id,
      created.run.id,
      created.cases[0]!.caseId,
      demoMidLevelSelections,
    );
    await expect(calibration.completeRun(source.organization.id, created.run.id)).rejects.toMatchObject({
      code: "CALIBRATION_INCOMPLETE",
    });
  });

  it("keeps run membership frozen when Gold Standard partitions later change", async () => {
    const source = await setup("calibration-snapshot", "HOLDOUT");
    const created = await calibration.createRun(source.organization.id, {
      name: "Holdout frozen",
      partition: "HOLDOUT",
      methodologyVersionId: source.methodology.id,
    });
    expect(created.cases).toHaveLength(2);

    const listed = await gold.listCases(source.organization.id);
    await gold.assignPartition(source.organization.id, listed[0]!.id, "UNASSIGNED");

    const existing = await calibration.getRunView(source.organization.id, created.run.id);
    expect(existing?.cases).toHaveLength(2);

    const newer = await calibration.createRun(source.organization.id, {
      name: "Holdout after change",
      partition: "HOLDOUT",
      methodologyVersionId: source.methodology.id,
    });
    expect(newer.cases).toHaveLength(1);
  });

  it("isolates runs and case updates by organization", async () => {
    const tenantA = await setup("calibration-tenant-a", "CALIBRATION", ["A-1"]);
    const tenantB = await setup("calibration-tenant-b", "CALIBRATION", ["B-1"]);
    const created = await calibration.createRun(tenantA.organization.id, {
      name: "Tenant A",
      partition: "CALIBRATION",
      methodologyVersionId: tenantA.methodology.id,
    });

    expect(await calibration.getRunView(tenantB.organization.id, created.run.id)).toBeNull();
    await expect(
      calibration.saveCandidate(
        tenantB.organization.id,
        created.run.id,
        created.cases[0]!.caseId,
        demoMidLevelSelections,
      ),
    ).rejects.toMatchObject({ code: "CALIBRATION_RUN_NOT_FOUND" });
  });

  it("rejects non-manual candidate sources until an integration exists", async () => {
    const source = await setup("calibration-source", "CALIBRATION", ["S-1"]);
    await expect(calibration.createRun(source.organization.id, {
      name: "Fake AI",
      partition: "CALIBRATION",
      methodologyVersionId: source.methodology.id,
      candidateSource: "AI",
    })).rejects.toMatchObject({ code: "CALIBRATION_SOURCE_NOT_AVAILABLE" });
  });
});
