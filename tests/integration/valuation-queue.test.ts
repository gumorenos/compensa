import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ValuationQueueService,
  emptyValuationQueueFilters,
  type ValuationQueueFilters,
} from "../../src/application/valuation-queue-service.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for valuation queue integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);
const queueService = new ValuationQueueService(pool);

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

function filters(overrides: Partial<ValuationQueueFilters>): ValuationQueueFilters {
  return { ...emptyValuationQueueFilters(), ...overrides };
}

async function createUser(name: string, email: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO auth_users (name, email, email_verified)
     VALUES ($1, $2, true)
     RETURNING id`,
    [name, email],
  );
  return result.rows[0]!.id as string;
}

async function recordStarter(
  organizationId: string,
  valuationId: string,
  actorUserId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO security_audit_events
      (organization_id, actor_user_id, action, resource_type, resource_id, payload)
     VALUES ($1, $2, 'VALUATION_STARTED', 'VALUATION', $3, '{}'::jsonb)`,
    [organizationId, actorUserId, valuationId],
  );
}

async function setValuationState(
  valuationId: string,
  status: "DRAFT" | "IN_REVIEW" | "APPROVED",
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

describe("valuation work queue persistence boundary", () => {
  it("isolates the tenant, exposes status counts and derives optional starters from audit history", async () => {
    const organizationA = await repository.createOrganization({
      slug: "queue-a",
      name: "Queue A",
      currencyCode: "PEN",
    });
    const organizationB = await repository.createOrganization({
      slug: "queue-b",
      name: "Queue B",
      currencyCode: "PEN",
    });
    const methodologyA1 = await repository.createMethodologyVersion({
      organizationId: organizationA.id,
      definition: demoMethodology,
      contentOwner: "Queue A",
      status: "ACTIVE",
    });
    const methodologyA2 = await repository.createMethodologyVersion({
      organizationId: organizationA.id,
      definition: { ...demoMethodology, version: "2.0.0" },
      contentOwner: "Queue A",
      status: "ACTIVE",
    });
    const methodologyB = await repository.createMethodologyVersion({
      organizationId: organizationB.id,
      definition: demoMethodology,
      contentOwner: "Queue B",
      status: "ACTIVE",
    });

    const alphaJob = await repository.createJob(organizationA.id, {
      code: "FIN-001",
      name: "Analista de Planeamiento",
      area: "Finanzas",
      department: "Administración",
      jobFamily: "Finance",
    });
    const betaJob = await repository.createJob(organizationA.id, {
      code: "OPS-001",
      name: "Jefe de Operaciones",
      area: "Operaciones",
      department: "Operaciones",
      jobFamily: "Operations",
    });
    const gammaJob = await repository.createJob(organizationA.id, {
      code: "FIN-002",
      name: "Especialista Financiero",
      area: "Finanzas",
      department: "Administración",
      jobFamily: "Finance",
    });
    const foreignJob = await repository.createJob(organizationB.id, {
      code: "FOREIGN-001",
      name: "Puesto extranjero",
      area: "Foreign Area",
      jobFamily: "Foreign Family",
    });

    const alpha = await valuationService.startValuation(organizationA.id, alphaJob.id, methodologyA1.id);
    const beta = await valuationService.startValuation(organizationA.id, betaJob.id, methodologyA1.id);
    const gamma = await valuationService.startValuation(organizationA.id, gammaJob.id, methodologyA2.id);
    const foreign = await valuationService.startValuation(organizationB.id, foreignJob.id, methodologyB.id);

    await setValuationState(alpha.id, "DRAFT", null, null, "2026-08-20T10:00:00Z");
    await setValuationState(beta.id, "APPROVED", 231, "G3", "2026-08-21T10:00:00Z");
    await setValuationState(gamma.id, "IN_REVIEW", 190, "G2", "2026-08-22T10:00:00Z");
    await setValuationState(foreign.id, "APPROVED", 231, "G3", "2026-08-23T10:00:00Z");

    const evaluator = await createUser("Eva Evaluadora", "eva@example.com");
    const manager = await createUser("Rita Revisora", "rita@example.com");
    const foreignUser = await createUser("Foreign User", "foreign@example.com");
    await recordStarter(organizationA.id, alpha.id, evaluator);
    await recordStarter(organizationA.id, beta.id, manager);
    await recordStarter(organizationB.id, foreign.id, foreignUser);

    const result = await queueService.getQueue(organizationA.id);

    expect(result.totalMatching).toBe(3);
    expect(result.items.map((item) => item.valuationId)).toEqual([gamma.id, beta.id, alpha.id]);
    expect(result.statusCounts).toMatchObject({ DRAFT: 1, IN_REVIEW: 1, APPROVED: 1 });
    expect(JSON.stringify(result)).not.toContain("Puesto extranjero");
    expect(JSON.stringify(result)).not.toContain("Foreign Area");
    expect(result.items.find((item) => item.valuationId === alpha.id)?.startedBy).toMatchObject({
      id: evaluator,
      name: "Eva Evaluadora",
    });
    expect(result.items.find((item) => item.valuationId === gamma.id)?.startedBy).toBeNull();
    expect(result.options.areas).toEqual(["Finanzas", "Operaciones"]);
    expect(result.options.jobFamilies).toEqual(["Finance", "Operations"]);
    expect(result.options.gradeCodes).toEqual(["G2", "G3"]);
    expect(result.options.actors.map((actor) => actor.id)).toEqual([evaluator, manager]);
    expect(result.options.methodologies.map((methodology) => methodology.id).sort()).toEqual(
      [methodologyA1.id, methodologyA2.id].sort(),
    );
  });

  it("applies operational filters independently and in combination", async () => {
    const organization = await repository.createOrganization({
      slug: "queue-filters",
      name: "Queue Filters",
      currencyCode: "PEN",
    });
    const methodologyOne = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Queue Filters",
      status: "ACTIVE",
    });
    const methodologyTwo = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: { ...demoMethodology, version: "2.0.0" },
      contentOwner: "Queue Filters",
      status: "ACTIVE",
    });
    const userOne = await createUser("Uno", "uno@example.com");
    const userTwo = await createUser("Dos", "dos@example.com");

    const firstJob = await repository.createJob(organization.id, {
      code: "FIN-100",
      name: "Analista de Finanzas",
      area: "Finanzas",
      jobFamily: "Finance",
    });
    const secondJob = await repository.createJob(organization.id, {
      code: "OPS-200",
      name: "Jefe de Operaciones",
      area: "Operaciones",
      jobFamily: "Operations",
    });
    const thirdJob = await repository.createJob(organization.id, {
      code: "FIN-300",
      name: "Gerente Financiero",
      area: "Finanzas",
      jobFamily: "Finance",
    });
    const first = await valuationService.startValuation(organization.id, firstJob.id, methodologyOne.id);
    const second = await valuationService.startValuation(organization.id, secondJob.id, methodologyOne.id);
    const third = await valuationService.startValuation(organization.id, thirdJob.id, methodologyTwo.id);
    await setValuationState(first.id, "DRAFT", null, null, "2026-08-20T10:00:00Z");
    await setValuationState(second.id, "APPROVED", 231, "G3", "2026-08-21T10:00:00Z");
    await setValuationState(third.id, "IN_REVIEW", 190, "G2", "2026-08-22T10:00:00Z");
    await recordStarter(organization.id, first.id, userOne);
    await recordStarter(organization.id, second.id, userTwo);

    const only = async (overrides: Partial<ValuationQueueFilters>) =>
      (await queueService.getQueue(organization.id, filters(overrides))).items.map((item) => item.valuationId);

    expect(await only({ status: "APPROVED" })).toEqual([second.id]);
    expect(await only({ area: "Finanzas" })).toEqual([third.id, first.id]);
    expect(await only({ jobFamily: "Operations" })).toEqual([second.id]);
    expect(await only({ gradeCode: "G2" })).toEqual([third.id]);
    expect(await only({ methodologyVersionId: methodologyTwo.id })).toEqual([third.id]);
    expect(await only({ actorUserId: userOne })).toEqual([first.id]);
    expect(await only({ dateFrom: "2026-08-21", dateTo: "2026-08-21" })).toEqual([second.id]);
    expect(await only({ query: "OPS-200" })).toEqual([second.id]);
    expect(await only({ query: "finanzas" })).toEqual([first.id]);
    expect(await only({ area: "Finanzas", methodologyVersionId: methodologyTwo.id, gradeCode: "G2" })).toEqual([third.id]);
  });
});
