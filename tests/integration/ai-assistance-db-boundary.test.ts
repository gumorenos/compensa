import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AIAssistanceProvider } from "../../src/ai/contracts.js";
import { AIAssistanceService } from "../../src/application/ai-assistance-service.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for AI provenance boundary tests.");
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

async function createRun() {
  const organization = await repository.createOrganization({
    slug: `ai-boundary-${randomUUID().slice(0, 8)}`,
    name: "AI Boundary Org",
    currencyCode: "PEN",
  });
  const job = await repository.createJob(organization.id, {
    code: `AI-${randomUUID().slice(0, 6)}`,
    name: "Analista de Planeamiento",
  });
  await repository.createJobDescriptionVersion(organization.id, job.id, {
    content: "Analiza información financiera y coordina con líderes de distintas áreas.",
    sourceLabel: "JD boundary",
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
  const actorId = randomUUID();
  await pool.query(
    `INSERT INTO auth_users (id, name, email, email_verified)
     VALUES ($1, 'AI Boundary User', $2, true)`,
    [actorId, `${actorId}@example.com`],
  );
  const provider: AIAssistanceProvider = {
    providerId: "BOUNDARY_TEST",
    modelId: "fixture-v1",
    analyze: async () => ({
      suggestions: [
        {
          dimensionCode: "DOMAIN_KNOWLEDGE",
          suggestedLevelCode: "K2",
          confidence: 0.75,
          rationale: "El puesto requiere conocimiento aplicado.",
          evidence: [
            {
              excerpt: "Analiza información financiera",
              sourceSection: "Responsabilidades",
            },
          ],
        },
      ],
      clarifications: [
        {
          dimensionCode: "AUTONOMY",
          question: "¿Qué decisiones puede tomar sin aprobación?",
          reason: "El descriptivo no especifica límites de autoridad.",
        },
      ],
    }),
  };
  const run = await new AIAssistanceService(pool, provider, "assist-boundary-v1").generate(
    organization.id,
    valuation.id,
    actorId,
  );
  return { organization, valuation, actorId, run };
}

describe("AI assistance database provenance boundary", () => {
  it("freezes provider provenance while allowing only one-way clarification status resolution", async () => {
    const { organization, run } = await createRun();
    const suggestion = run.suggestions[0]!;
    const evidence = suggestion.evidence[0]!;
    const clarification = run.clarifications[0]!;

    await expect(
      pool.query(`UPDATE ai_assistance_runs SET provider_id = 'CHANGED' WHERE id = $1`, [run.id]),
    ).rejects.toThrow(/AI assistance runs are immutable/);

    await expect(
      pool.query(
        `UPDATE ai_factor_suggestions SET suggested_level_code = 'K3'
         WHERE organization_id = $1 AND id = $2`,
        [organization.id, suggestion.id],
      ),
    ).rejects.toThrow(/AI suggestion provenance is immutable/);

    await expect(
      pool.query(
        `UPDATE ai_suggestion_evidence SET excerpt = 'changed'
         WHERE organization_id = $1 AND id = $2`,
        [organization.id, evidence.id],
      ),
    ).rejects.toThrow(/AI suggestion evidence is immutable/);

    await expect(
      pool.query(
        `UPDATE ai_clarification_questions SET question_text = 'changed'
         WHERE organization_id = $1 AND id = $2`,
        [organization.id, clarification.id],
      ),
    ).rejects.toThrow(/AI clarification provenance is immutable/);

    await pool.query(
      `UPDATE ai_clarification_questions SET status = 'ANSWERED'
       WHERE organization_id = $1 AND id = $2`,
      [organization.id, clarification.id],
    );
    const answered = await pool.query(
      `SELECT status FROM ai_clarification_questions WHERE id = $1`,
      [clarification.id],
    );
    expect(answered.rows[0]!.status).toBe("ANSWERED");

    await expect(
      pool.query(
        `UPDATE ai_clarification_questions SET status = 'DISMISSED'
         WHERE organization_id = $1 AND id = $2`,
        [organization.id, clarification.id],
      ),
    ).rejects.toThrow(/Resolved AI clarification status is immutable/);

    await expect(
      pool.query(
        `DELETE FROM ai_factor_suggestions WHERE organization_id = $1 AND id = $2`,
        [organization.id, suggestion.id],
      ),
    ).rejects.toThrow(/AI suggestion provenance is immutable/);
  });

  it("keeps the referenced valuation and creator while AI provenance exists", async () => {
    const { valuation, actorId, run } = await createRun();

    await pool.query(
      `DELETE FROM security_audit_events
       WHERE resource_type = 'AI_ASSISTANCE_RUN' AND resource_id = $1`,
      [run.id],
    );

    await expect(
      pool.query(`DELETE FROM auth_users WHERE id = $1`, [actorId]),
    ).rejects.toThrow(/foreign key constraint/i);

    await expect(
      pool.query(`DELETE FROM valuations WHERE id = $1`, [valuation.id]),
    ).rejects.toThrow(/foreign key constraint/i);
  });
});
