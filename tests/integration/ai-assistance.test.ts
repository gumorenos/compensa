import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AIAssistanceProvider, AIAssistanceProviderInput } from "../../src/ai/contracts.js";
import {
  AIAssistanceError,
  AIAssistanceService,
} from "../../src/application/ai-assistance-service.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for AI assistance integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);

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
    `TRUNCATE ai_suggestion_evidence, ai_clarification_questions, ai_factor_suggestions,
      ai_assistance_runs, calibration_run_cases, calibration_runs,
      gold_standard_evidence, gold_standard_decisions, gold_standard_cases,
      security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
}

async function createActor(name = "AI Evaluator"): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO auth_users (id, name, email, email_verified)
     VALUES ($1, $2, $3, true)`,
    [id, name, `${id}@example.com`],
  );
  return id;
}

async function createValuationFixture(options?: { withDescription?: boolean }) {
  const organization = await repository.createOrganization({
    slug: `ai-${randomUUID().slice(0, 8)}`,
    name: "AI Foundation Org",
    currencyCode: "PEN",
  });
  const job = await repository.createJob(organization.id, {
    code: `AI-${randomUUID().slice(0, 6)}`,
    name: "Analista de Planeamiento",
    area: "Finanzas",
    jobFamily: "Finance",
  });
  let descriptionId: string | null = null;
  if (options?.withDescription !== false) {
    const description = await repository.createJobDescriptionVersion(organization.id, job.id, {
      content:
        "Responsable de análisis financiero y coordinación con líderes de distintas áreas. " +
        "Resuelve problemas de complejidad intermedia con autonomía dentro de políticas definidas. " +
        "No tiene personal directo a cargo.",
      sourceLabel: "JD test",
    });
    descriptionId = description.id;
  }
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
  return { organization, job, methodology, valuation, descriptionId };
}

class FixtureProvider implements AIAssistanceProvider {
  readonly providerId = "FIXTURE";
  readonly modelId = "deterministic-test-v1";
  lastInput: AIAssistanceProviderInput | null = null;

  constructor(private readonly payload: unknown = validPayload()) {}

  async analyze(input: AIAssistanceProviderInput): Promise<unknown> {
    this.lastInput = input;
    return this.payload;
  }
}

function validPayload(): unknown {
  return {
    suggestions: [
      {
        dimensionCode: "DOMAIN_KNOWLEDGE",
        suggestedLevelCode: "K2",
        confidence: 0.8,
        rationale: "El descriptivo exige conocimiento aplicado y coordinación transversal.",
        evidence: [
          {
            excerpt: "análisis financiero y coordinación con líderes de distintas áreas",
            sourceSection: "Responsabilidades",
          },
        ],
      },
      {
        dimensionCode: "PEOPLE_SCOPE",
        suggestedLevelCode: null,
        confidence: null,
        rationale: "No hay evidencia suficiente sobre liderazgo funcional.",
        evidence: [{ excerpt: "No tiene personal directo a cargo.", sourceSection: null }],
      },
    ],
    clarifications: [
      {
        dimensionCode: "PEOPLE_SCOPE",
        question: "¿Existe liderazgo funcional sin reportes directos?",
        reason: "El descriptivo solo descarta personal directo.",
      },
    ],
  };
}

describe("AI assistance persistence boundary", () => {
  it("persists suggestions separately without mutating valuation decisions, score, grade or status", async () => {
    const fixture = await createValuationFixture();
    const actorId = await createActor();
    const provider = new FixtureProvider();
    const service = new AIAssistanceService(pool, provider, "assist-v1");

    const before = await repository.getValuation(fixture.organization.id, fixture.valuation.id);
    const run = await service.generate(fixture.organization.id, fixture.valuation.id, actorId);
    const after = await repository.getValuation(fixture.organization.id, fixture.valuation.id);
    const decisions = await repository.listValuationDecisions(
      fixture.organization.id,
      fixture.valuation.id,
    );

    expect(provider.lastInput).not.toBeNull();
    expect(provider.lastInput!.methodology).not.toHaveProperty("scoring");
    expect(provider.lastInput!.methodology).not.toHaveProperty("grades");
    expect(run.status).toBe("COMPLETED");
    expect(run.suggestions).toHaveLength(2);
    expect(run.clarifications).toHaveLength(1);
    expect(run.jobDescriptionVersionId).toBe(fixture.descriptionId);
    expect(decisions).toHaveLength(0);
    expect(after).toMatchObject({
      status: before!.status,
      totalPoints: before!.totalPoints,
      gradeCode: before!.gradeCode,
    });

    const audit = await pool.query(
      `SELECT action, resource_type, resource_id, payload
       FROM security_audit_events
       WHERE organization_id = $1 AND resource_id = $2`,
      [fixture.organization.id, run.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      action: "AI_ASSISTANCE_RECORDED",
      resource_type: "AI_ASSISTANCE_RUN",
    });
    expect(JSON.stringify(audit.rows[0]!.payload)).not.toContain("análisis financiero");
  });

  it("keeps the original AI suggestion unchanged after a later human decision", async () => {
    const fixture = await createValuationFixture();
    const actorId = await createActor();
    const service = new AIAssistanceService(pool, new FixtureProvider(), "assist-v1");
    const run = await service.generate(fixture.organization.id, fixture.valuation.id, actorId);

    await valuationService.saveDecision(fixture.organization.id, fixture.valuation.id, {
      dimensionCode: "DOMAIN_KNOWLEDGE",
      selectedLevelCode: "K3",
      source: "AI_MODIFIED",
    });

    const reread = await service.getRun(fixture.organization.id, run.id);
    const decision = (
      await repository.listValuationDecisions(fixture.organization.id, fixture.valuation.id)
    ).find((item) => item.dimensionCode === "DOMAIN_KNOWLEDGE");

    expect(reread?.suggestions.find((item) => item.dimensionCode === "DOMAIN_KNOWLEDGE")).toMatchObject({
      suggestedLevelCode: "K2",
      confidence: 0.8,
    });
    expect(decision).toMatchObject({ selectedLevelCode: "K3", source: "AI_MODIFIED" });
  });

  it("requires a pinned job description and an editable valuation", async () => {
    const actorId = await createActor();
    const withoutDescription = await createValuationFixture({ withDescription: false });
    const service = new AIAssistanceService(pool, new FixtureProvider(), "assist-v1");

    await expect(
      service.generate(withoutDescription.organization.id, withoutDescription.valuation.id, actorId),
    ).rejects.toMatchObject({ code: "AI_JOB_DESCRIPTION_REQUIRED" });

    const fixture = await createValuationFixture();
    await pool.query(`UPDATE valuations SET status = 'IN_REVIEW' WHERE id = $1`, [fixture.valuation.id]);
    await expect(
      service.generate(fixture.organization.id, fixture.valuation.id, actorId),
    ).rejects.toMatchObject({ code: "AI_VALUATION_NOT_EDITABLE" });
  });

  it("rejects invalid provider output transactionally with no run or audit residue", async () => {
    const fixture = await createValuationFixture();
    const actorId = await createActor();
    const invalidProvider = new FixtureProvider({
      suggestions: [
        {
          dimensionCode: "DOMAIN_KNOWLEDGE",
          suggestedLevelCode: "K2",
          confidence: 0.8,
          rationale: "Attempted score output",
          evidence: [],
          points: 999,
        },
      ],
      clarifications: [],
    });
    const service = new AIAssistanceService(pool, invalidProvider, "assist-v1");

    await expect(
      service.generate(fixture.organization.id, fixture.valuation.id, actorId),
    ).rejects.toMatchObject({ code: "AI_RESULT_UNKNOWN_FIELD" });

    const runs = await pool.query(
      `SELECT count(*)::int AS count FROM ai_assistance_runs WHERE organization_id = $1`,
      [fixture.organization.id],
    );
    const audit = await pool.query(
      `SELECT count(*)::int AS count FROM security_audit_events
       WHERE organization_id = $1 AND action = 'AI_ASSISTANCE_RECORDED'`,
      [fixture.organization.id],
    );
    expect(runs.rows[0]!.count).toBe(0);
    expect(audit.rows[0]!.count).toBe(0);
  });

  it("does not persist a stale provider result if valuation status changes during analysis", async () => {
    const fixture = await createValuationFixture();
    const actorId = await createActor();
    const provider: AIAssistanceProvider = {
      providerId: "RACE_TEST",
      modelId: null,
      analyze: async () => {
        await pool.query(`UPDATE valuations SET status = 'IN_REVIEW' WHERE id = $1`, [
          fixture.valuation.id,
        ]);
        return validPayload();
      },
    };
    const service = new AIAssistanceService(pool, provider, "assist-v1");

    await expect(
      service.generate(fixture.organization.id, fixture.valuation.id, actorId),
    ).rejects.toMatchObject({ code: "AI_VALUATION_NOT_EDITABLE" });
    const runs = await pool.query(`SELECT count(*)::int AS count FROM ai_assistance_runs`);
    expect(runs.rows[0]!.count).toBe(0);
  });

  it("keeps stored runs tenant-isolated on read", async () => {
    const fixture = await createValuationFixture();
    const actorId = await createActor();
    const service = new AIAssistanceService(pool, new FixtureProvider(), "assist-v1");
    const run = await service.generate(fixture.organization.id, fixture.valuation.id, actorId);
    const otherOrganization = await repository.createOrganization({
      slug: `other-${randomUUID().slice(0, 8)}`,
      name: "Other Org",
      currencyCode: "PEN",
    });

    expect(await service.getRun(otherOrganization.id, run.id)).toBeNull();
    expect(await service.getRun(fixture.organization.id, run.id)).not.toBeNull();
  });

  it("returns a sanitized provider failure and writes no partial run", async () => {
    const fixture = await createValuationFixture();
    const actorId = await createActor();
    const provider: AIAssistanceProvider = {
      providerId: "FAIL_TEST",
      modelId: "test",
      analyze: async () => {
        throw new Error("secret upstream detail");
      },
    };
    const service = new AIAssistanceService(pool, provider, "assist-v1");

    try {
      await service.generate(fixture.organization.id, fixture.valuation.id, actorId);
      throw new Error("Expected provider failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(AIAssistanceError);
      expect((error as AIAssistanceError).code).toBe("AI_PROVIDER_FAILED");
      expect((error as Error).message).not.toContain("secret upstream detail");
    }
    const runs = await pool.query(`SELECT count(*)::int AS count FROM ai_assistance_runs`);
    expect(runs.rows[0]!.count).toBe(0);
  });
});
