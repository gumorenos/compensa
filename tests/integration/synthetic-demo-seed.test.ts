import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedSyntheticDemoData } from "../../src/application/synthetic-demo-seed.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";
import { SYNTHETIC_DEMO_MARKER } from "../../src/fixtures/synthetic-demo-data.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for synthetic demo integration tests.");

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

async function provisionSyntheticTestOrganization() {
  const organization = await repository.createOrganization({
    slug: "synthetic-seed-test",
    name: "Synthetic Seed Test",
    countryCode: "PE",
    currencyCode: "PEN",
  });
  await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Synthetic test",
    status: "ACTIVE",
  });
  return organization;
}

describe("synthetic demo seed", () => {
  it("creates realistic workflow states and Gold Standard references idempotently", async () => {
    const organization = await provisionSyntheticTestOrganization();

    const first = await seedSyntheticDemoData(pool, organization.slug);
    const second = await seedSyntheticDemoData(pool, organization.slug);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ jobs: 7, valuations: 7, goldStandardCases: 3 });

    const statuses = await pool.query(
      `SELECT v.status, count(*)::int AS count
       FROM valuations v JOIN jobs j ON j.id = v.job_id
       WHERE v.organization_id = $1 AND j.code LIKE 'SYN-DEMO-%'
       GROUP BY v.status ORDER BY v.status`,
      [organization.id],
    );
    expect(statuses.rows).toEqual([
      { status: "APPROVED", count: 3 },
      { status: "DRAFT", count: 2 },
      { status: "IN_REVIEW", count: 1 },
      { status: "RETURNED", count: 1 },
    ]);

    const draftDecisions = await pool.query(
      `SELECT j.code, count(d.id)::int AS count
       FROM jobs j JOIN valuations v ON v.job_id = j.id
       LEFT JOIN valuation_decisions d ON d.valuation_id = v.id
       WHERE j.organization_id = $1 AND j.code IN ('SYN-DEMO-HR-ASST', 'SYN-DEMO-COMP-AN')
       GROUP BY j.code ORDER BY j.code`,
      [organization.id],
    );
    expect(draftDecisions.rows).toEqual([
      { code: "SYN-DEMO-COMP-AN", count: 6 },
      { code: "SYN-DEMO-HR-ASST", count: 3 },
    ]);

    const descriptions = await pool.query(
      `SELECT count(*)::int AS count FROM job_description_versions
       WHERE organization_id = $1 AND source_label = $2`,
      [organization.id, SYNTHETIC_DEMO_MARKER],
    );
    expect(descriptions.rows[0]?.count).toBe(7);

    const gold = await pool.query(
      `SELECT case_code, status, partition, is_anchor, notes
       FROM gold_standard_cases WHERE organization_id = $1 ORDER BY case_code`,
      [organization.id],
    );
    expect(gold.rows).toHaveLength(3);
    expect(gold.rows.every((row) => row.status === "VALIDATED" && row.notes === SYNTHETIC_DEMO_MARKER)).toBe(true);
    expect(gold.rows.filter((row) => row.partition === "CALIBRATION")).toHaveLength(2);
    expect(gold.rows.filter((row) => row.partition === "HOLDOUT")).toHaveLength(1);
    expect(gold.rows.filter((row) => row.is_anchor)).toHaveLength(1);

    const duplicateCodes = await pool.query(
      `SELECT code, count(*)::int AS count FROM jobs
       WHERE organization_id = $1 AND code LIKE 'SYN-DEMO-%'
       GROUP BY code HAVING count(*) > 1`,
      [organization.id],
    );
    expect(duplicateCodes.rows).toHaveLength(0);
  });

  it("refuses to overwrite a synthetic job changed during QA", async () => {
    const organization = await provisionSyntheticTestOrganization();
    await seedSyntheticDemoData(pool, organization.slug);
    await pool.query(
      "UPDATE jobs SET area = 'Área modificada durante QA' WHERE organization_id = $1 AND code = 'SYN-DEMO-COMP-AN'",
      [organization.id],
    );

    await expect(seedSyntheticDemoData(pool, organization.slug)).rejects.toMatchObject({
      code: "DEMO_JOB_COLLISION",
    });

    const row = await pool.query(
      "SELECT area FROM jobs WHERE organization_id = $1 AND code = 'SYN-DEMO-COMP-AN'",
      [organization.id],
    );
    expect(row.rows[0]?.area).toBe("Área modificada durante QA");
  });

  it("preserves a manual workflow status change instead of advancing it again", async () => {
    const organization = await provisionSyntheticTestOrganization();
    await seedSyntheticDemoData(pool, organization.slug);

    const candidate = await pool.query(
      `SELECT v.id
       FROM valuations v JOIN jobs j ON j.id = v.job_id
       WHERE v.organization_id = $1 AND v.status = 'IN_REVIEW' AND j.code LIKE 'SYN-DEMO-%'
       LIMIT 1`,
      [organization.id],
    );
    const valuationId = candidate.rows[0]?.id as string | undefined;
    if (valuationId === undefined) throw new Error("Expected synthetic IN_REVIEW valuation.");

    await valuationService.returnForChanges(
      organization.id,
      valuationId,
      "Cambio manual deliberado durante QA.",
    );

    await expect(seedSyntheticDemoData(pool, organization.slug)).rejects.toMatchObject({
      code: "DEMO_STATUS_COLLISION",
    });

    const valuation = await repository.getValuation(organization.id, valuationId);
    expect(valuation?.status).toBe("RETURNED");
    const history = await repository.listReviewActions(organization.id, valuationId);
    expect(history.at(-1)?.comment).toBe("Cambio manual deliberado durante QA.");
  });
});
