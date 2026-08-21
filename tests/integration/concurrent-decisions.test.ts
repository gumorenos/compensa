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
    `TRUNCATE valuation_events, valuation_decisions, valuations,
      methodology_versions, jobs, organizations RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("concurrent valuation decisions", () => {
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
});
