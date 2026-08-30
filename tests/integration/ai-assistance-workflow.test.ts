import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAIAssistanceProviderBinding } from "../../src/ai/provider-binding.js";
import {
  AIAssistanceWorkflowError,
  AIAssistanceWorkflowService,
} from "../../src/application/ai-assistance-workflow-service.js";
import { AIGovernanceService } from "../../src/application/ai-governance-service.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for AI workflow integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);
const governance = new AIGovernanceService(pool);
const localBinding = getAIAssistanceProviderBinding({ COMPENSA_AI_FIXTURE_ENABLED: "true" });
if (localBinding === null) throw new Error("Expected local fixture binding.");

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query("TRUNCATE organizations, auth_users RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  await pool.end();
});

async function createActor(name = "AI workflow evaluator"): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO auth_users (id, name, email, email_verified)
     VALUES ($1, $2, $3, true)`,
    [id, name, `${id}@example.com`],
  );
  return id;
}

async function createFixture(slug: string) {
  const organization = await repository.createOrganization({
    slug,
    name: `Org ${slug}`,
    currencyCode: "PEN",
  });
  const job = await repository.createJob(organization.id, {
    name: "Analista de Planeamiento",
    area: "Finanzas",
    jobFamily: "Finance",
  });
  const description = await repository.createJobDescriptionVersion(organization.id, job.id, {
    content:
      "Responsable de análisis financiero y coordinación transversal con líderes de distintas áreas. " +
      "Resuelve problemas dentro de políticas definidas y documenta sus decisiones. " +
      "No tiene personal directo a cargo.",
    sourceLabel: "Workflow fixture",
  });
  const methodology = await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa test",
    status: "ACTIVE",
  });
  const valuation = await valuationService.startValuation(
    organization.id,
    job.id,
    methodology.id,
  );
  expect(valuation.jobDescriptionVersionId).toBe(description.id);
  return { organization, job, description, methodology, valuation };
}

describe("AI assistance application workflow", () => {
  it("blocks generation by default while leaving the deterministic manual flow usable", async () => {
    const fixture = await createFixture("workflow-default-off");
    const actorId = await createActor();
    const workflow = new AIAssistanceWorkflowService(pool, localBinding);

    await expect(
      workflow.generate(fixture.organization.id, fixture.valuation.id, actorId),
    ).rejects.toMatchObject({ code: "AI_ASSISTANCE_DISABLED" });

    const runs = await pool.query(
      `SELECT count(*)::int AS count FROM ai_assistance_runs WHERE organization_id = $1`,
      [fixture.organization.id],
    );
    expect(runs.rows[0]!.count).toBe(0);

    const manual = await valuationService.saveDecision(
      fixture.organization.id,
      fixture.valuation.id,
      { dimensionCode: "DOMAIN_KNOWLEDGE", selectedLevelCode: "K2", source: "MANUAL" },
    );
    expect(manual.decisions).toHaveLength(1);
    expect(manual.decisions[0]).toMatchObject({
      dimensionCode: "DOMAIN_KNOWLEDGE",
      selectedLevelCode: "K2",
      source: "MANUAL",
    });
  });

  it("allows the LOCAL fixture without external-processing consent and does not mutate the valuation", async () => {
    const fixture = await createFixture("workflow-local");
    const actorId = await createActor();
    await governance.updateSettings(fixture.organization.id, actorId, {
      assistanceEnabled: true,
      externalProcessingAllowed: false,
    });
    const workflow = new AIAssistanceWorkflowService(pool, localBinding);

    const before = await repository.getValuation(fixture.organization.id, fixture.valuation.id);
    const run = await workflow.generate(fixture.organization.id, fixture.valuation.id, actorId);
    const after = await repository.getValuation(fixture.organization.id, fixture.valuation.id);
    const decisions = await repository.listValuationDecisions(
      fixture.organization.id,
      fixture.valuation.id,
    );

    expect(run.providerId).toBe("LOCAL_FIXTURE");
    expect(run.suggestions.length).toBeGreaterThan(0);
    expect(run.suggestions.some((item) => item.suggestedLevelCode === null)).toBe(true);
    expect(decisions).toEqual([]);
    expect(after).toMatchObject({
      status: before!.status,
      totalPoints: before!.totalPoints,
      gradeCode: before!.gradeCode,
    });

    const state = await workflow.getState(fixture.organization.id, fixture.valuation.id);
    expect(state.settings).toMatchObject({
      assistanceEnabled: true,
      externalProcessingAllowed: false,
    });
    expect(state.provider).toMatchObject({
      available: true,
      processingMode: "LOCAL",
      testFixture: true,
    });
    expect(state.latest?.run.id).toBe(run.id);
  });

  it("resolves fixture suggestions through the existing human-resolution service", async () => {
    const fixture = await createFixture("workflow-resolution");
    const actorId = await createActor();
    await governance.updateSettings(fixture.organization.id, actorId, {
      assistanceEnabled: true,
      externalProcessingAllowed: false,
    });
    const workflow = new AIAssistanceWorkflowService(pool, localBinding);
    const run = await workflow.generate(fixture.organization.id, fixture.valuation.id, actorId);
    const concrete = run.suggestions.find((item) => item.suggestedLevelCode !== null);
    if (concrete === undefined) throw new Error("Fixture must produce a concrete suggestion.");

    const result = await workflow.resolve(
      fixture.organization.id,
      concrete.id,
      actorId,
      {
        resolution: "ACCEPTED",
        justification: "El evaluador confirma el nivel después de revisar la evidencia.",
        note: "Aceptado durante prueba local.",
      },
    );

    expect(result.resolution).toMatchObject({
      resolution: "ACCEPTED",
      resolvedLevelCode: concrete.suggestedLevelCode,
      resolvedByUserId: actorId,
    });
    expect(result.valuation?.decisions).toContainEqual(
      expect.objectContaining({
        dimensionCode: concrete.dimensionCode,
        selectedLevelCode: concrete.suggestedLevelCode,
        source: "AI_ACCEPTED",
        justification: "El evaluador confirma el nivel después de revisar la evidencia.",
      }),
    );

    const state = await workflow.getState(fixture.organization.id, fixture.valuation.id);
    expect(state.latest?.resolutions[concrete.id]).toMatchObject({
      resolution: "ACCEPTED",
      resolvedLevelCode: concrete.suggestedLevelCode,
    });
  });

  it("keeps historical runs readable but blocks new resolution after tenant assistance is disabled", async () => {
    const fixture = await createFixture("workflow-revoked");
    const actorId = await createActor();
    await governance.updateSettings(fixture.organization.id, actorId, {
      assistanceEnabled: true,
      externalProcessingAllowed: false,
    });
    const workflow = new AIAssistanceWorkflowService(pool, localBinding);
    const run = await workflow.generate(fixture.organization.id, fixture.valuation.id, actorId);
    const unresolved = run.suggestions[0]!;

    await governance.updateSettings(fixture.organization.id, actorId, {
      assistanceEnabled: false,
      externalProcessingAllowed: false,
    });

    const state = await workflow.getState(fixture.organization.id, fixture.valuation.id);
    expect(state.settings.assistanceEnabled).toBe(false);
    expect(state.latest?.run.id).toBe(run.id);
    await expect(
      workflow.resolve(fixture.organization.id, unresolved.id, actorId, { resolution: "REJECTED" }),
    ).rejects.toMatchObject({ code: "AI_ASSISTANCE_DISABLED" });
  });

  it("returns provider-unavailable safely and writes no run when the tenant is enabled", async () => {
    const fixture = await createFixture("workflow-no-provider");
    const actorId = await createActor();
    await governance.updateSettings(fixture.organization.id, actorId, {
      assistanceEnabled: true,
      externalProcessingAllowed: false,
    });
    const workflow = new AIAssistanceWorkflowService(pool, null);

    await expect(
      workflow.generate(fixture.organization.id, fixture.valuation.id, actorId),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE" });
    const count = await pool.query(
      `SELECT count(*)::int AS count FROM ai_assistance_runs WHERE organization_id = $1`,
      [fixture.organization.id],
    );
    expect(count.rows[0]!.count).toBe(0);
  });

  it("rejects malformed and cross-tenant valuation identifiers before exposing workflow state", async () => {
    const fixtureA = await createFixture("workflow-tenant-a");
    const fixtureB = await createFixture("workflow-tenant-b");
    const workflow = new AIAssistanceWorkflowService(pool, localBinding);

    await expect(workflow.getState(fixtureA.organization.id, "not-a-uuid")).rejects.toMatchObject({
      code: "AI_WORKFLOW_VALUATION_NOT_FOUND",
    });
    await expect(
      workflow.generate(fixtureA.organization.id, "not-a-uuid", randomUUID()),
    ).rejects.toBeInstanceOf(AIAssistanceWorkflowError);
    await expect(
      workflow.getState(fixtureB.organization.id, fixtureA.valuation.id),
    ).rejects.toMatchObject({ code: "AI_WORKFLOW_VALUATION_NOT_FOUND" });
  });
});
