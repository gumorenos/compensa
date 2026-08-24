import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CalibrationService } from "../../src/application/calibration-service.js";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { demoMethodology, demoMidLevelSelections } from "../../src/fixtures/demo-methodology.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for calibration audit tests.");
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

async function setup() {
  const organization = await core.createOrganization({
    slug: "calibration-audit",
    name: "Calibration Audit",
    currencyCode: "PEN",
  });
  const methodology = await core.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa demo",
    status: "ACTIVE",
  });
  const userResult = await pool.query(
    `INSERT INTO auth_users (name, email, email_verified)
     VALUES ('Calibration Admin', 'calibration-audit@example.com', true)
     RETURNING id`,
  );
  const userId = userResult.rows[0]!.id as string;
  await gold.importHistoricalCases(organization.id, {
    version: 1,
    cases: [{
      caseCode: "GS-AUDIT",
      anonymizedLabel: "Referencia audit",
      methodologyVersionId: methodology.id,
      partition: "CALIBRATION",
      job: {
        code: "JOB-AUDIT",
        name: "Puesto audit",
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
  return { organization, methodology, userId };
}

describe("calibration security audit atomicity", () => {
  it("writes create and completion audit events with the authenticated actor", async () => {
    const fixture = await setup();
    const created = await calibration.createRun(fixture.organization.id, {
      name: "Audited run",
      partition: "CALIBRATION",
      methodologyVersionId: fixture.methodology.id,
      createdByUserId: fixture.userId,
    });
    await calibration.saveCandidate(
      fixture.organization.id,
      created.run.id,
      created.cases[0]!.caseId,
      demoMidLevelSelections,
    );
    await calibration.completeRun(fixture.organization.id, created.run.id, fixture.userId);

    const events = await pool.query(
      `SELECT action, actor_user_id, resource_type, resource_id
       FROM security_audit_events
       WHERE organization_id = $1 AND resource_id = $2
       ORDER BY id`,
      [fixture.organization.id, created.run.id],
    );
    expect(events.rows).toEqual([
      {
        action: "CALIBRATION_RUN_CREATED",
        actor_user_id: fixture.userId,
        resource_type: "CALIBRATION_RUN",
        resource_id: created.run.id,
      },
      {
        action: "CALIBRATION_RUN_COMPLETED",
        actor_user_id: fixture.userId,
        resource_type: "CALIBRATION_RUN",
        resource_id: created.run.id,
      },
    ]);
  });

  it("rolls completion back if its audit event cannot be persisted", async () => {
    const fixture = await setup();
    const created = await calibration.createRun(fixture.organization.id, {
      name: "Audit rollback",
      partition: "CALIBRATION",
      methodologyVersionId: fixture.methodology.id,
      createdByUserId: fixture.userId,
    });
    await calibration.saveCandidate(
      fixture.organization.id,
      created.run.id,
      created.cases[0]!.caseId,
      demoMidLevelSelections,
    );

    await expect(
      calibration.completeRun(fixture.organization.id, created.run.id, randomUUID()),
    ).rejects.toBeDefined();

    const run = await calibration.getRunView(fixture.organization.id, created.run.id);
    expect(run?.run.status).toBe("DRAFT");
    expect(run?.run.summary).toBeNull();

    const completedAudit = await pool.query(
      `SELECT count(*)::int AS count
       FROM security_audit_events
       WHERE organization_id = $1 AND resource_id = $2 AND action = 'CALIBRATION_RUN_COMPLETED'`,
      [fixture.organization.id, created.run.id],
    );
    expect(completedAudit.rows[0]?.count).toBe(0);
  });
});
