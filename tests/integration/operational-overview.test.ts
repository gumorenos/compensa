import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OperationalOverviewService } from "../../src/application/operational-overview-service.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for operational overview integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);
const overviewService = new OperationalOverviewService(pool);

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

async function setValuationState(
  valuationId: string,
  status: "DRAFT" | "IN_REVIEW" | "RETURNED" | "APPROVED" | "SUPERSEDED" | "CANCELLED",
  points: number | null,
  gradeCode: string | null,
  updatedAt: string,
): Promise<void> {
  await pool.query(
    `UPDATE valuations
     SET status = $2, total_points = $3, grade_code = $4, updated_at = $5::timestamptz
     WHERE id = $1`,
    [valuationId, status, points, gradeCode, updatedAt],
  );
}

describe("operational overview persistence boundary", () => {
  it("computes tenant metrics with precise active-job and incomplete-valuation semantics", async () => {
    const organizationA = await repository.createOrganization({
      slug: "overview-a",
      name: "Overview A",
      currencyCode: "PEN",
    });
    const organizationB = await repository.createOrganization({
      slug: "overview-b",
      name: "Overview B",
      currencyCode: "PEN",
    });
    const methodologyA = await repository.createMethodologyVersion({
      organizationId: organizationA.id,
      definition: demoMethodology,
      contentOwner: "Overview A",
      status: "ACTIVE",
    });
    const methodologyB = await repository.createMethodologyVersion({
      organizationId: organizationB.id,
      definition: demoMethodology,
      contentOwner: "Overview B",
      status: "ACTIVE",
    });

    const approvedJob = await repository.createJob(organizationA.id, {
      code: "APP-001",
      name: "Puesto aprobado",
      area: "Finanzas",
      jobFamily: "Finance",
    });
    const draftJob = await repository.createJob(organizationA.id, {
      code: "DRAFT-001",
      name: "Puesto borrador",
      area: "Operaciones",
      jobFamily: "Operations",
    });
    const returnedJob = await repository.createJob(organizationA.id, {
      code: "RET-001",
      name: "Puesto devuelto",
      area: "Personas",
      jobFamily: "HR",
    });
    const noValuationJob = await repository.createJob(organizationA.id, {
      code: "NONE-001",
      name: "Puesto sin valoración",
      area: "Tecnología",
      jobFamily: "Technology",
    });
    const inactiveJob = await repository.createJob(organizationA.id, {
      code: "INACTIVE-001",
      name: "Puesto inactivo",
      area: "Legal",
      jobFamily: "Legal",
    });
    await pool.query(`UPDATE jobs SET status = 'INACTIVE' WHERE id = $1`, [inactiveJob.id]);

    const approved = await valuationService.startValuation(organizationA.id, approvedJob.id, methodologyA.id);
    const draft = await valuationService.startValuation(organizationA.id, draftJob.id, methodologyA.id);
    const returned = await valuationService.startValuation(organizationA.id, returnedJob.id, methodologyA.id);
    const inactiveValuation = await valuationService.startValuation(
      organizationA.id,
      inactiveJob.id,
      methodologyA.id,
    );

    await setValuationState(approved.id, "APPROVED", 231, "G3", "2026-08-20T10:00:00Z");
    await setValuationState(draft.id, "DRAFT", null, null, "2026-08-21T10:00:00Z");
    await setValuationState(returned.id, "RETURNED", 190, "G2", "2026-08-22T10:00:00Z");
    await setValuationState(inactiveValuation.id, "DRAFT", null, null, "2026-08-23T10:00:00Z");

    const foreignJob = await repository.createJob(organizationB.id, {
      code: "FOREIGN-001",
      name: "Puesto extranjero",
    });
    const foreign = await valuationService.startValuation(organizationB.id, foreignJob.id, methodologyB.id);
    await setValuationState(foreign.id, "APPROVED", 999, "GX", "2099-01-01T00:00:00Z");

    const result = await overviewService.getOverview(organizationA.id);

    expect(result.metrics.activeJobs).toBe(4);
    expect(result.metrics.jobsWithoutApprovedValuation).toBe(3);
    expect(result.metrics.incompleteEditableValuations).toBe(2);
    expect(result.metrics.statusCounts).toMatchObject({
      DRAFT: 2,
      IN_REVIEW: 0,
      RETURNED: 1,
      APPROVED: 1,
      SUPERSEDED: 0,
      CANCELLED: 0,
    });
    expect(JSON.stringify(result)).not.toContain("Puesto extranjero");
    expect(JSON.stringify(result)).not.toContain("999");
    expect(result.recentValuations.map((item) => item.valuationId)).toEqual([
      inactiveValuation.id,
      returned.id,
      draft.id,
      approved.id,
    ]);
  });

  it("orders recent valuation versions by updated_at and caps the operational activity feed at eight", async () => {
    const organization = await repository.createOrganization({
      slug: "overview-recent",
      name: "Overview Recent",
      currencyCode: "PEN",
    });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Overview Recent",
      status: "ACTIVE",
    });

    const valuations: Array<{ id: string; name: string }> = [];
    for (let index = 1; index <= 10; index += 1) {
      const job = await repository.createJob(organization.id, {
        code: `REC-${String(index).padStart(2, "0")}`,
        name: `Puesto reciente ${index}`,
        area: "Operaciones",
        jobFamily: "Operations",
      });
      const valuation = await valuationService.startValuation(organization.id, job.id, methodology.id);
      await setValuationState(
        valuation.id,
        index % 2 === 0 ? "APPROVED" : "IN_REVIEW",
        index % 2 === 0 ? 200 + index : 180 + index,
        index % 2 === 0 ? "G3" : "G2",
        `2026-08-${String(index).padStart(2, "0")}T12:00:00Z`,
      );
      valuations.push({ id: valuation.id, name: job.name });
    }

    const result = await overviewService.getOverview(organization.id);
    const expected = valuations.slice(2).reverse();

    expect(result.recentValuations).toHaveLength(8);
    expect(result.recentValuations.map((item) => item.valuationId)).toEqual(
      expected.map((item) => item.id),
    );
    expect(result.recentValuations.map((item) => item.jobName)).toEqual(
      expected.map((item) => item.name),
    );
    expect(result.metrics.statusCounts.APPROVED).toBe(5);
    expect(result.metrics.statusCounts.IN_REVIEW).toBe(5);
  });
});
