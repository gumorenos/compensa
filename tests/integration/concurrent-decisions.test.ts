import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ValuationService } from "../../src/application/valuation-service.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for persistence integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const service = new ValuationService(repository);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, organizations RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("valuation workflow guards", () => {
  it("recalculates from the complete committed decision set after simultaneous edits", async () => {
    const organization = await repository.createOrganization({
      slug: "decision-concurrency",
      name: "Decision Concurrency Corp",
      currencyCode: "PEN",
    });
    const job = await repository.createJob(organization.id, { name: "Jefe de Planeamiento" });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Compensa demo",
    });
    const valuation = await service.startValuation(
      organization.id,
      job.id,
      methodology.id,
    );

    for (const [dimensionCode, selectedLevelCode] of [
      ["DOMAIN_KNOWLEDGE", "K2"],
      ["KNOWLEDGE_BREADTH", "B2"],
      ["PROBLEM_COMPLEXITY", "C2"],
      ["AUTONOMY", "A2"],
    ] as const) {
      await service.saveDecision(organization.id, valuation.id, {
        dimensionCode,
        selectedLevelCode,
      });
    }

    const results = await Promise.all([
      service.saveDecision(organization.id, valuation.id, {
        dimensionCode: "IMPACT_SCOPE",
        selectedLevelCode: "S2",
      }),
      service.saveDecision(organization.id, valuation.id, {
        dimensionCode: "PEOPLE_SCOPE",
        selectedLevelCode: "P1",
      }),
    ]);

    expect(results.some((snapshot) => snapshot.complete)).toBe(true);

    const final = await service.getSnapshot(organization.id, valuation.id);
    expect(final?.complete).toBe(true);
    expect(final?.valuation.totalPoints).toBe(231);
    expect(final?.valuation.gradeCode).toBe("G3");
    expect(final?.decisions).toHaveLength(6);
  });

  it("does not start a valuation from a draft methodology version", async () => {
    const organization = await repository.createOrganization({
      slug: "draft-method",
      name: "Draft Method Corp",
      currencyCode: "PEN",
    });
    const job = await repository.createJob(organization.id, { name: "Analista" });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Compensa demo",
      status: "DRAFT",
    });

    await expect(
      service.startValuation(organization.id, job.id, methodology.id),
    ).rejects.toMatchObject({ code: "METHODOLOGY_NOT_ACTIVE" });

    const count = await pool.query("SELECT count(*)::int AS count FROM valuations");
    expect(count.rows[0]?.count).toBe(0);
  });
});
