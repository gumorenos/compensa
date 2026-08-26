import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AIAssistanceProvider } from "../../src/ai/contracts.js";
import {
  AIAssistanceResolutionError,
  AIAssistanceResolutionService,
} from "../../src/application/ai-assistance-resolution-service.js";
import { AIAssistanceService } from "../../src/application/ai-assistance-service.js";
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
  throw new Error("DATABASE_URL is required for AI resolution integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);
const resolutionService = new AIAssistanceResolutionService(pool);

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
    `TRUNCATE ai_suggestion_resolutions, ai_suggestion_evidence, ai_clarification_questions,
      ai_factor_suggestions, ai_assistance_runs, calibration_run_cases, calibration_runs,
      gold_standard_evidence, gold_standard_decisions, gold_standard_cases,
      security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
}

async function createActor(label = "Human evaluator"): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO auth_users (id, name, email, email_verified)
     VALUES ($1, $2, $3, true)`,
    [id, label, `${id}@example.com`],
  );
  return id;
}

async function createFixture() {
  const organization = await repository.createOrganization({
    slug: `resolution-${randomUUID().slice(0, 8)}`,
    name: "AI Resolution Org",
    currencyCode: "PEN",
  });
  const job = await repository.createJob(organization.id, {
    code: `RES-${randomUUID().slice(0, 6)}`,
    name: "Analista de Planeamiento",
  });
  await repository.createJobDescriptionVersion(organization.id, job.id, {
    content:
      "Responsable de análisis financiero y coordinación con líderes de distintas áreas. " +
      "Resuelve problemas de complejidad intermedia con autonomía dentro de políticas definidas. " +
      "No tiene personal directo a cargo.",
  });
  const methodology = await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Test",
    status: "ACTIVE",
  });
  const valuation = await valuationService.startValuation(
    organization.id,
    job.id,
    methodology.id,
  );
  const aiActorId = await createActor("AI requester");
  const aiService = new AIAssistanceService(pool, fixtureProvider(), "resolution-test-v1");
  const run = await aiService.generate(organization.id, valuation.id, aiActorId);
  const concrete = run.suggestions.find((item) => item.dimensionCode === "DOMAIN_KNOWLEDGE");
  const abstention = run.suggestions.find((item) => item.dimensionCode === "PEOPLE_SCOPE");
  if (concrete === undefined || abstention === undefined) {
    throw new Error("Resolution fixture suggestions are incomplete.");
  }
  return { organization, job, methodology, valuation, run, concrete, abstention, aiService };
}

function fixtureProvider(): AIAssistanceProvider {
  return {
    providerId: "FIXTURE",
    modelId: "resolution-test",
    analyze: async () => ({
      suggestions: [
        {
          dimensionCode: "DOMAIN_KNOWLEDGE",
          suggestedLevelCode: "K2",
          confidence: 0.8,
          rationale: "El descriptivo requiere conocimiento profesional aplicado.",
          evidence: [{ excerpt: "análisis financiero", sourceSection: null }],
        },
        {
          dimensionCode: "PEOPLE_SCOPE",
          suggestedLevelCode: null,
          confidence: null,
          rationale: "El descriptivo no permite concluir liderazgo funcional.",
          evidence: [{ excerpt: "No tiene personal directo a cargo.", sourceSection: null }],
        },
      ],
      clarifications: [],
    }),
  };
}

async function completeValuationManually(organizationId: string, valuationId: string): Promise<void> {
  for (const [dimensionCode, selectedLevelCode] of Object.entries(demoMidLevelSelections)) {
    await valuationService.saveDecision(organizationId, valuationId, {
      dimensionCode,
      selectedLevelCode,
      source: "MANUAL",
    });
  }
}

describe("AI suggestion human resolution", () => {
  it("accepts a concrete suggestion atomically through the deterministic valuation path", async () => {
    const fixture = await createFixture();
    const humanId = await createActor();

    const result = await resolutionService.resolve(
      fixture.organization.id,
      fixture.concrete.id,
      humanId,
      {
        resolution: "ACCEPTED",
        note: "Revisado por evaluador.",
        justification: "La evidencia del descriptivo sustenta conocimiento profesional.",
      },
    );

    expect(result.resolution).toMatchObject({
      suggestionId: fixture.concrete.id,
      resolution: "ACCEPTED",
      resolvedLevelCode: "K2",
      resolvedByUserId: humanId,
      note: "Revisado por evaluador.",
    });
    const decisions = await repository.listValuationDecisions(
      fixture.organization.id,
      fixture.valuation.id,
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      dimensionCode: "DOMAIN_KNOWLEDGE",
      selectedLevelCode: "K2",
      source: "AI_ACCEPTED",
      justification: "La evidencia del descriptivo sustenta conocimiento profesional.",
    });
    expect(result.valuation?.complete).toBe(false);
    expect(result.valuation?.valuation.totalPoints).toBeNull();

    const originalRun = await fixture.aiService.getRun(fixture.organization.id, fixture.run.id);
    expect(originalRun?.suggestions.find((item) => item.id === fixture.concrete.id)).toMatchObject({
      suggestedLevelCode: "K2",
      confidence: 0.8,
    });

    const event = await pool.query(
      `SELECT action, actor_user_id, payload
       FROM valuation_events
       WHERE organization_id = $1 AND valuation_id = $2 AND action = 'AI_SUGGESTION_RESOLVED'`,
      [fixture.organization.id, fixture.valuation.id],
    );
    expect(event.rows).toHaveLength(1);
    expect(event.rows[0]).toMatchObject({ actor_user_id: humanId });
    const audit = await pool.query(
      `SELECT actor_user_id, payload
       FROM security_audit_events
       WHERE organization_id = $1
         AND action = 'AI_SUGGESTION_RESOLVED'
         AND resource_id = $2`,
      [fixture.organization.id, fixture.concrete.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ actor_user_id: humanId });
    expect(JSON.stringify(audit.rows[0]!.payload)).not.toContain("Revisado por evaluador");
    expect(JSON.stringify(audit.rows[0]!.payload)).not.toContain("evidencia del descriptivo");
  });

  it("records a real modification and recalculates using the existing deterministic engine", async () => {
    const fixture = await createFixture();
    const humanId = await createActor();

    const result = await resolutionService.resolve(
      fixture.organization.id,
      fixture.concrete.id,
      humanId,
      {
        resolution: "MODIFIED",
        resolvedLevelCode: "K3",
        justification: "El evaluador confirmó alcance multidisciplinario.",
      },
    );

    expect(result.resolution).toMatchObject({
      resolution: "MODIFIED",
      resolvedLevelCode: "K3",
    });
    const decisions = await repository.listValuationDecisions(
      fixture.organization.id,
      fixture.valuation.id,
    );
    expect(decisions[0]).toMatchObject({
      dimensionCode: "DOMAIN_KNOWLEDGE",
      selectedLevelCode: "K3",
      source: "AI_MODIFIED",
    });

    const reread = await fixture.aiService.getRun(fixture.organization.id, fixture.run.id);
    expect(reread?.suggestions.find((item) => item.id === fixture.concrete.id)?.suggestedLevelCode).toBe(
      "K2",
    );
  });

  it("rejects without changing an existing human decision, points or grade", async () => {
    const fixture = await createFixture();
    await completeValuationManually(fixture.organization.id, fixture.valuation.id);
    const before = await repository.getValuation(fixture.organization.id, fixture.valuation.id);
    const beforeDecisions = await repository.listValuationDecisions(
      fixture.organization.id,
      fixture.valuation.id,
    );
    const humanId = await createActor();

    const result = await resolutionService.resolve(
      fixture.organization.id,
      fixture.concrete.id,
      humanId,
      { resolution: "REJECTED", note: "La sugerencia no aporta a esta decisión." },
    );

    expect(result.valuation).toBeNull();
    expect(result.resolution).toMatchObject({ resolution: "REJECTED", resolvedLevelCode: null });
    const after = await repository.getValuation(fixture.organization.id, fixture.valuation.id);
    const afterDecisions = await repository.listValuationDecisions(
      fixture.organization.id,
      fixture.valuation.id,
    );
    expect(after).toMatchObject({ totalPoints: before!.totalPoints, gradeCode: before!.gradeCode });
    expect(afterDecisions).toEqual(beforeDecisions);
  });

  it("treats an AI abstention as non-acceptable but allows an explicit human modification", async () => {
    const first = await createFixture();
    const humanId = await createActor();

    await expect(
      resolutionService.resolve(first.organization.id, first.abstention.id, humanId, {
        resolution: "ACCEPTED",
      }),
    ).rejects.toMatchObject({ code: "AI_SUGGESTION_HAS_NO_LEVEL" });
    expect(await resolutionService.getResolution(first.organization.id, first.abstention.id)).toBeNull();

    const result = await resolutionService.resolve(
      first.organization.id,
      first.abstention.id,
      humanId,
      {
        resolution: "MODIFIED",
        resolvedLevelCode: "P0",
        justification: "El descriptivo confirma ausencia de liderazgo formal.",
      },
    );
    expect(result.resolution).toMatchObject({ resolution: "MODIFIED", resolvedLevelCode: "P0" });
    const decision = (
      await repository.listValuationDecisions(first.organization.id, first.valuation.id)
    ).find((item) => item.dimensionCode === "PEOPLE_SCOPE");
    expect(decision).toMatchObject({ selectedLevelCode: "P0", source: "AI_MODIFIED" });
  });

  it("rolls back both resolution and valuation mutation on invalid or mislabeled modifications", async () => {
    const fixture = await createFixture();
    const humanId = await createActor();

    await expect(
      resolutionService.resolve(fixture.organization.id, fixture.concrete.id, humanId, {
        resolution: "MODIFIED",
        resolvedLevelCode: "K2",
      }),
    ).rejects.toMatchObject({ code: "AI_RESOLUTION_NOT_MODIFIED" });
    await expect(
      resolutionService.resolve(fixture.organization.id, fixture.concrete.id, humanId, {
        resolution: "MODIFIED",
        resolvedLevelCode: "K9",
      }),
    ).rejects.toMatchObject({ code: "AI_RESOLUTION_INVALID_LEVEL" });

    expect(await resolutionService.getResolution(fixture.organization.id, fixture.concrete.id)).toBeNull();
    expect(
      await repository.listValuationDecisions(fixture.organization.id, fixture.valuation.id),
    ).toHaveLength(0);
  });

  it("allows exactly one immutable resolution under concurrent attempts", async () => {
    const fixture = await createFixture();
    const actorA = await createActor("Evaluator A");
    const actorB = await createActor("Evaluator B");

    const results = await Promise.allSettled([
      resolutionService.resolve(fixture.organization.id, fixture.concrete.id, actorA, {
        resolution: "ACCEPTED",
      }),
      resolutionService.resolve(fixture.organization.id, fixture.concrete.id, actorB, {
        resolution: "REJECTED",
      }),
    ]);

    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((item) => item.status === "rejected");
    expect(rejected).toBeDefined();
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(AIAssistanceResolutionError);
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "AI_SUGGESTION_ALREADY_RESOLVED",
    });

    const rows = await pool.query(
      `SELECT count(*)::int AS count FROM ai_suggestion_resolutions WHERE suggestion_id = $1`,
      [fixture.concrete.id],
    );
    expect(rows.rows[0]!.count).toBe(1);
  });

  it("is tenant-isolated and treats malformed UUIDs as unavailable before SQL casting", async () => {
    const fixture = await createFixture();
    const humanId = await createActor();
    const other = await repository.createOrganization({
      slug: `other-${randomUUID().slice(0, 8)}`,
      name: "Other tenant",
      currencyCode: "PEN",
    });

    await expect(
      resolutionService.resolve(other.id, fixture.concrete.id, humanId, { resolution: "REJECTED" }),
    ).rejects.toMatchObject({ code: "AI_SUGGESTION_NOT_FOUND" });
    await expect(
      resolutionService.resolve(fixture.organization.id, "not-a-uuid", humanId, {
        resolution: "REJECTED",
      }),
    ).rejects.toMatchObject({ code: "AI_SUGGESTION_NOT_FOUND" });
    expect(await resolutionService.getResolution(other.id, fixture.concrete.id)).toBeNull();
  });

  it("blocks resolution after the valuation leaves the editable workflow", async () => {
    const fixture = await createFixture();
    const humanId = await createActor();
    await pool.query(`UPDATE valuations SET status = 'IN_REVIEW' WHERE id = $1`, [fixture.valuation.id]);

    await expect(
      resolutionService.resolve(fixture.organization.id, fixture.concrete.id, humanId, {
        resolution: "ACCEPTED",
      }),
    ).rejects.toMatchObject({ code: "AI_SUGGESTION_NOT_EDITABLE" });
    expect(await resolutionService.getResolution(fixture.organization.id, fixture.concrete.id)).toBeNull();
  });

  it("enforces resolution semantics and immutability at the PostgreSQL boundary", async () => {
    const fixture = await createFixture();
    const humanId = await createActor();

    await expect(
      pool.query(
        `INSERT INTO ai_suggestion_resolutions
          (organization_id, suggestion_id, resolution, resolved_level_code, resolved_by_user_id)
         VALUES ($1, $2, 'ACCEPTED', 'K3', $3)`,
        [fixture.organization.id, fixture.concrete.id, humanId],
      ),
    ).rejects.toThrow(/accepted ai resolution must use the suggested level/i);

    const saved = await resolutionService.resolve(
      fixture.organization.id,
      fixture.concrete.id,
      humanId,
      { resolution: "ACCEPTED" },
    );
    await expect(
      pool.query(`UPDATE ai_suggestion_resolutions SET note = 'tampered' WHERE id = $1`, [
        saved.resolution.id,
      ]),
    ).rejects.toThrow(/immutable/i);
    await expect(
      pool.query(`DELETE FROM ai_suggestion_resolutions WHERE id = $1`, [saved.resolution.id]),
    ).rejects.toThrow(/immutable/i);
  });
});
