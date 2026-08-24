import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CalibrationService } from "../../src/application/calibration-service.js";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { demoMethodology, demoMidLevelSelections } from "../../src/fixtures/demo-methodology.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for calibration tampering tests.");
}

const pool = createPool(databaseUrl);
const core = new CompensaRepository(pool);
const calibration = new CalibrationService(pool);
const gold = new GoldStandardService(pool);

beforeAll(async () => { await runMigrations(pool); });
beforeEach(async () => {
  await pool.query(
    `TRUNCATE calibration_run_cases, calibration_runs,
      gold_standard_evidence, gold_standard_decisions, gold_standard_cases,
      security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
});
afterAll(async () => { await pool.end(); });

describe("calibration payload hardening", () => {
  it("rejects forged selection dimensions without persisting a candidate", async () => {
    const organization = await core.createOrganization({
      slug: "calibration-tamper",
      name: "Calibration Tamper",
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
      cases: [{
        caseCode: "GS-TAMPER",
        anonymizedLabel: "Referencia tamper",
        methodologyVersionId: methodology.id,
        partition: "CALIBRATION",
        job: {
          code: "JOB-TAMPER",
          name: "Puesto tamper",
          department: "Operaciones",
          area: null,
          jobFamily: null,
        },
        decisions: Object.entries(demoMidLevelSelections).map(([dimensionCode, selectedLevelCode]) => ({
          dimensionCode,
          selectedLevelCode,
        })),
        expectedTotalPoints: 231,
        expectedGradeCode: "G3",
      }],
    });

    const run = await calibration.createRun(organization.id, {
      name: "Tamper run",
      partition: "CALIBRATION",
      methodologyVersionId: methodology.id,
    });

    await expect(calibration.saveCandidate(
      organization.id,
      run.run.id,
      run.cases[0]!.caseId,
      { ...demoMidLevelSelections, FAKE_DIMENSION: "FAKE_LEVEL" },
    )).rejects.toMatchObject({ code: "CALIBRATION_UNKNOWN_DIMENSION" });

    const stored = await calibration.getRunView(organization.id, run.run.id);
    expect(stored?.cases[0]?.candidateSelections).toBeNull();
    expect(stored?.cases[0]?.comparison).toBeNull();
    expect(stored?.evaluatedCount).toBe(0);
  });
});
