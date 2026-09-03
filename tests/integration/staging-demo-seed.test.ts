import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedStagingDemo } from "../../src/application/staging-demo-seed.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for staging demo seed integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query("TRUNCATE organizations RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  await pool.end();
});

async function prepareOrganization(slug = "compensa-staging") {
  const organization = await repository.createOrganization({
    slug,
    name: "Compensa Staging",
    countryCode: "PE",
    currencyCode: "PEN",
  });
  await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa demo fixture",
    status: "ACTIVE",
  });
  return organization;
}

describe("synthetic staging demo seed", () => {
  it("creates useful workflow and Gold Standard fixtures once and is idempotent", async () => {
    const organization = await prepareOrganization();

    const first = await seedStagingDemo(pool, "compensa-staging");
    expect(first.organizationId).toBe(organization.id);
    expect(first.items.map((item) => [item.code, item.status])).toEqual([
      ["SYN-DEMO-001", "DRAFT"],
      ["SYN-DEMO-002", "DRAFT"],
      ["SYN-DEMO-003", "IN_REVIEW"],
      ["SYN-DEMO-004", "RETURNED"],
      ["SYN-DEMO-005", "APPROVED"],
      ["SYN-DEMO-006", "APPROVED"],
      ["SYN-DEMO-007", "APPROVED"],
    ]);
    expect(first.items.every((item) => item.createdJob)).toBe(true);
    expect(first.items.every((item) => item.createdDescription)).toBe(true);
    expect(first.items.every((item) => item.createdValuation)).toBe(true);
    expect(first.items.filter((item) => item.createdGoldCase)).toHaveLength(3);

    const valuations = await pool.query(
      `SELECT jobs.code, valuations.status, valuations.total_points, valuations.grade_code
       FROM valuations
       JOIN jobs ON jobs.id = valuations.job_id
       WHERE valuations.organization_id = $1 AND jobs.code LIKE 'SYN-DEMO-%'
       ORDER BY jobs.code`,
      [organization.id],
    );
    expect(valuations.rows).toEqual([
      { code: "SYN-DEMO-001", status: "DRAFT", total_points: null, grade_code: null },
      { code: "SYN-DEMO-002", status: "DRAFT", total_points: "142.000000", grade_code: "G2" },
      { code: "SYN-DEMO-003", status: "IN_REVIEW", total_points: "231.000000", grade_code: "G3" },
      { code: "SYN-DEMO-004", status: "RETURNED", total_points: "289.000000", grade_code: "G4" },
      { code: "SYN-DEMO-005", status: "APPROVED", total_points: "100.000000", grade_code: "G1" },
      { code: "SYN-DEMO-006", status: "APPROVED", total_points: "231.000000", grade_code: "G3" },
      { code: "SYN-DEMO-007", status: "APPROVED", total_points: "420.000000", grade_code: "G5" },
    ]);

    const gold = await pool.query(
      `SELECT case_code, status, partition, is_anchor, expected_total_points, expected_grade_code, notes
       FROM gold_standard_cases
       WHERE organization_id = $1 AND case_code LIKE 'SYN-GS-%'
       ORDER BY case_code`,
      [organization.id],
    );
    expect(gold.rows.map((row) => ({
      caseCode: row.case_code,
      status: row.status,
      partition: row.partition,
      isAnchor: row.is_anchor,
      points: row.expected_total_points,
      grade: row.expected_grade_code,
    }))).toEqual([
      { caseCode: "SYN-GS-001", status: "VALIDATED", partition: "CALIBRATION", isAnchor: true, points: "100.000000", grade: "G1" },
      { caseCode: "SYN-GS-002", status: "VALIDATED", partition: "CALIBRATION", isAnchor: false, points: "231.000000", grade: "G3" },
      { caseCode: "SYN-GS-003", status: "VALIDATED", partition: "HOLDOUT", isAnchor: false, points: "420.000000", grade: "G5" },
    ]);
    expect(gold.rows.every((row) => String(row.notes).includes("SYNTHETIC / DEMO ONLY"))).toBe(true);

    const descriptions = await pool.query(
      `SELECT count(*)::int AS count
       FROM job_description_versions
       WHERE organization_id = $1 AND source_label = 'SYNTHETIC_DEMO_V1'`,
      [organization.id],
    );
    expect(descriptions.rows[0]?.count).toBe(7);

    const beforeEvents = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM valuation_events WHERE organization_id = $1) AS valuation_events,
         (SELECT count(*)::int FROM valuation_review_actions WHERE organization_id = $1) AS review_actions,
         (SELECT count(*)::int FROM gold_standard_cases WHERE organization_id = $1) AS gold_cases`,
      [organization.id],
    );

    const second = await seedStagingDemo(pool, "compensa-staging");
    expect(second.items.every((item) => !item.createdJob)).toBe(true);
    expect(second.items.every((item) => !item.createdDescription)).toBe(true);
    expect(second.items.every((item) => !item.createdValuation)).toBe(true);
    expect(second.items.every((item) => !item.createdGoldCase)).toBe(true);
    expect(second.items.every((item) => !item.customized)).toBe(true);

    const afterEvents = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM valuation_events WHERE organization_id = $1) AS valuation_events,
         (SELECT count(*)::int FROM valuation_review_actions WHERE organization_id = $1) AS review_actions,
         (SELECT count(*)::int FROM gold_standard_cases WHERE organization_id = $1) AS gold_cases`,
      [organization.id],
    );
    expect(afterEvents.rows[0]).toEqual(beforeEvents.rows[0]);
  });

  it("does not overwrite a manually customized synthetic draft", async () => {
    const organization = await prepareOrganization();
    const first = await seedStagingDemo(pool, "compensa-staging");
    const draft = first.items.find((item) => item.code === "SYN-DEMO-002");
    if (draft === undefined) throw new Error("Expected synthetic draft profile.");

    await valuationService.saveDecision(organization.id, draft.valuationId, {
      dimensionCode: "DOMAIN_KNOWLEDGE",
      selectedLevelCode: "K3",
      source: "MANUAL",
      justification: "Cambio manual deliberado para QA.",
    });

    const second = await seedStagingDemo(pool, "compensa-staging");
    expect(second.items.find((item) => item.code === "SYN-DEMO-002")?.customized).toBe(true);

    const decisions = await repository.listValuationDecisions(organization.id, draft.valuationId);
    const changed = decisions.find((decision) => decision.dimensionCode === "DOMAIN_KNOWLEDGE");
    expect(changed?.selectedLevelCode).toBe("K3");
    expect(changed?.justification).toBe("Cambio manual deliberado para QA.");
  });
});
