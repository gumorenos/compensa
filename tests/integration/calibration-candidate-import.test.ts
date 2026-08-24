import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CalibrationCandidateImportService } from "../../src/application/calibration-candidate-import-service.js";
import { CalibrationService } from "../../src/application/calibration-service.js";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { demoMethodology, demoMidLevelSelections } from "../../src/fixtures/demo-methodology.js";
import { CalibrationRepository } from "../../src/persistence/calibration.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for calibration candidate import tests.");
}

const pool = createPool(databaseUrl);
const core = new CompensaRepository(pool);
const gold = new GoldStandardService(pool);
const calibration = new CalibrationService(pool);
const candidates = new CalibrationCandidateImportService(pool);
const calibrationRepo = new CalibrationRepository(pool);

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

async function setup(slug: string, partition: "CALIBRATION" | "HOLDOUT", codes = ["GS-1", "GS-2"]) {
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
    cases: codes.map((caseCode) => ({
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
      decisions: Object.entries(demoMidLevelSelections).map(([dimensionCode, selectedLevelCode]) => ({
        dimensionCode,
        selectedLevelCode,
      })),
      expectedTotalPoints: 231,
      expectedGradeCode: "G3",
    })),
  });
  const actorId = randomUUID();
  await pool.query(
    `INSERT INTO auth_users (id, name, email, email_verified)
     VALUES ($1, $2, $3, true)`,
    [actorId, "Calibration Admin", `${slug}@example.com`],
  );
  const run = await calibration.createRun(organization.id, {
    name: `${partition} ${slug}`,
    partition,
    methodologyVersionId: methodology.id,
  });
  return { organization, methodology, run, actorId };
}

function document(codes: string[], mutate?: (caseCode: string, selections: Record<string, string>) => void) {
  return {
    version: 1,
    cases: codes.map((caseCode) => {
      const selections: Record<string, string> = { ...demoMidLevelSelections };
      mutate?.(caseCode, selections);
      return { caseCode, selections };
    }),
  };
}

describe("calibration candidate batch import", () => {
  it("previews without writes, imports multiple cases atomically and audits the batch", async () => {
    const source = await setup("candidate-batch", "CALIBRATION");
    const input = document(["GS-1", "GS-2"], (caseCode, selections) => {
      if (caseCode === "GS-2") selections.AUTONOMY = "A3";
    });

    const preview = await candidates.preview(source.organization.id, source.run.run.id, input);
    expect(preview.canImport).toBe(true);
    expect(preview.validCases).toBe(2);
    expect(preview.invalidCases).toBe(0);
    expect(preview.cases[0]?.metrics).not.toBeNull();

    let persisted = await calibrationRepo.listRunCases(source.organization.id, source.run.run.id);
    expect(persisted.every((item) => item.candidateSelections === null)).toBe(true);

    const imported = await candidates.importBatch(
      source.organization.id,
      source.run.run.id,
      input,
      source.actorId,
      "candidatos.csv",
    );
    expect(imported).toEqual({ importedCount: 2, overwrittenCount: 0 });

    persisted = await calibrationRepo.listRunCases(source.organization.id, source.run.run.id);
    expect(persisted.every((item) => item.candidateSelections !== null)).toBe(true);
    expect(persisted.find((item) => item.caseCodeSnapshot === "GS-2")?.candidatePoints).toBe(252);

    const audit = await pool.query(
      `SELECT action, actor_user_id, payload
       FROM security_audit_events
       WHERE organization_id = $1 AND resource_id = $2`,
      [source.organization.id, source.run.run.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.action).toBe("CALIBRATION_CANDIDATE_BATCH_IMPORTED");
    expect(audit.rows[0]?.actor_user_id).toBe(source.actorId);
    expect(audit.rows[0]?.payload.importedCount).toBe(2);
  });

  it("marks replacements and overwrites only while the run remains draft", async () => {
    const source = await setup("candidate-overwrite", "CALIBRATION", ["GS-1"]);
    const first = document(["GS-1"]);
    await candidates.importBatch(source.organization.id, source.run.run.id, first, source.actorId, "first.csv");

    const second = document(["GS-1"], (_caseCode, selections) => { selections.AUTONOMY = "A3"; });
    const preview = await candidates.preview(source.organization.id, source.run.run.id, second);
    expect(preview.overwriteCases).toBe(1);
    expect(preview.cases[0]?.status).toBe("OVERWRITE");

    const result = await candidates.importBatch(source.organization.id, source.run.run.id, second, source.actorId, "second.csv");
    expect(result.overwrittenCount).toBe(1);
    const item = (await calibrationRepo.listRunCases(source.organization.id, source.run.run.id))[0];
    expect(item?.candidateSelections?.AUTONOMY).toBe("A3");
  });

  it("keeps HOLDOUT preview blind and live aggregate hidden after import", async () => {
    const source = await setup("candidate-holdout", "HOLDOUT", ["GS-1"]);
    const input = document(["GS-1"], (_caseCode, selections) => { selections.AUTONOMY = "A3"; });

    const preview = await candidates.preview(source.organization.id, source.run.run.id, input);
    expect(preview.partition).toBe("HOLDOUT");
    expect(preview.canImport).toBe(true);
    expect(preview.cases[0]).toMatchObject({
      candidatePoints: null,
      candidateGradeCode: null,
      metrics: null,
    });

    await candidates.importBatch(source.organization.id, source.run.run.id, input, source.actorId, "holdout.xlsx");
    const view = await calibration.getRunView(source.organization.id, source.run.run.id);
    expect(view?.evaluatedCount).toBe(1);
    expect(view?.liveSummary).toBeNull();
    expect(view?.run.status).toBe("DRAFT");
  });

  it("rolls back the whole batch when a later case is invalid", async () => {
    const source = await setup("candidate-rollback", "CALIBRATION");
    const input = document(["GS-1", "GS-2"], (caseCode, selections) => {
      if (caseCode === "GS-2") selections.AUTONOMY = "NOT_A_LEVEL";
    });

    const preview = await candidates.preview(source.organization.id, source.run.run.id, input);
    expect(preview.canImport).toBe(false);
    expect(preview.invalidCases).toBe(1);

    await expect(
      candidates.importBatch(source.organization.id, source.run.run.id, input, source.actorId, "bad.csv"),
    ).rejects.toMatchObject({ code: "CALIBRATION_CANDIDATE_INVALID" });

    const persisted = await calibrationRepo.listRunCases(source.organization.id, source.run.run.id);
    expect(persisted.every((item) => item.candidateSelections === null)).toBe(true);
    const auditCount = await pool.query(
      `SELECT count(*)::int AS count FROM security_audit_events
       WHERE organization_id = $1 AND action = 'CALIBRATION_CANDIDATE_BATCH_IMPORTED'`,
      [source.organization.id],
    );
    expect(auditCount.rows[0]?.count).toBe(0);
  });

  it("rejects cases from another run or organization without revealing them", async () => {
    const tenantA = await setup("candidate-tenant-a", "CALIBRATION", ["A-1"]);
    const tenantB = await setup("candidate-tenant-b", "CALIBRATION", ["B-1"]);

    const preview = await candidates.preview(
      tenantA.organization.id,
      tenantA.run.run.id,
      document(["B-1"]),
    );
    expect(preview.canImport).toBe(false);
    expect(preview.cases[0]?.anonymizedLabel).toBeNull();
    expect(preview.cases[0]?.message).toMatch(/no pertenece/i);

    await expect(
      candidates.preview(tenantB.organization.id, tenantA.run.run.id, document(["A-1"])),
    ).rejects.toMatchObject({ code: "CALIBRATION_RUN_NOT_FOUND" });
  });

  it("refuses imports after explicit run completion", async () => {
    const source = await setup("candidate-complete", "CALIBRATION", ["GS-1"]);
    const input = document(["GS-1"]);
    await candidates.importBatch(source.organization.id, source.run.run.id, input, source.actorId, "done.csv");
    await calibration.completeRun(source.organization.id, source.run.run.id);

    await expect(
      candidates.preview(source.organization.id, source.run.run.id, input),
    ).rejects.toMatchObject({ code: "CALIBRATION_RUN_COMPLETED" });
  });
});
