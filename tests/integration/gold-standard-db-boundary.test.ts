import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoMethodology } from "../../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for Gold Standard DB-boundary tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE gold_standard_evidence, gold_standard_decisions, gold_standard_cases,
      security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

async function createBase() {
  const organization = await repository.createOrganization({
    slug: "gold-db-boundary",
    name: "Gold DB Boundary",
    currencyCode: "PEN",
  });
  const methodology = await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa demo",
    status: "ACTIVE",
  });
  const snapshot = JSON.stringify({
    code: null,
    name: "Puesto anonimizado",
    department: null,
    area: null,
    jobFamily: null,
  });
  return { organization, methodology, snapshot };
}

async function insertDraft(
  organizationId: string,
  methodologyVersionId: string,
  code: string,
  snapshot: string,
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO gold_standard_cases (
      organization_id, case_code, anonymized_label, source_type,
      methodology_version_id, job_snapshot, methodology_snapshot
    ) VALUES ($1, $2, $2, 'IMPORT', $3, $4::jsonb, $5::jsonb)
    RETURNING id`,
    [
      organizationId,
      code,
      methodologyVersionId,
      snapshot,
      JSON.stringify(demoMethodology),
    ],
  );
  const id = result.rows[0]?.id as string | undefined;
  if (id === undefined) throw new Error("Expected Gold Standard draft ID.");
  return id;
}

describe("Gold Standard database boundary", () => {
  it("rejects cases that attempt to be born already validated", async () => {
    const { organization, methodology, snapshot } = await createBase();

    await expect(
      pool.query(
        `INSERT INTO gold_standard_cases (
          organization_id, case_code, anonymized_label, source_type,
          methodology_version_id, status, job_snapshot, methodology_snapshot,
          expected_total_points, expected_grade_code
        ) VALUES ($1, 'GS-SKIP-DRAFT', 'Skip draft', 'IMPORT', $2,
          'VALIDATED', $3::jsonb, $4::jsonb, 231, 'G3')`,
        [organization.id, methodology.id, snapshot, JSON.stringify(demoMethodology)],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("cannot move a decision out of a validated reference into an editable draft", async () => {
    const { organization, methodology, snapshot } = await createBase();
    const validatedCaseId = await insertDraft(
      organization.id,
      methodology.id,
      "GS-VALIDATED",
      snapshot,
    );
    const draftCaseId = await insertDraft(
      organization.id,
      methodology.id,
      "GS-DESTINATION",
      snapshot,
    );

    const decision = await pool.query(
      `INSERT INTO gold_standard_decisions (
        organization_id, case_id, dimension_code, selected_level_code
      ) VALUES ($1, $2, 'AUTONOMY', 'A2')
      RETURNING id`,
      [organization.id, validatedCaseId],
    );
    const decisionId = decision.rows[0]?.id as string | undefined;
    if (decisionId === undefined) throw new Error("Expected decision ID.");

    await pool.query(
      `UPDATE gold_standard_cases
       SET status = 'VALIDATED', expected_total_points = 231,
           expected_grade_code = 'G3', validated_at = now()
       WHERE id = $1`,
      [validatedCaseId],
    );

    await expect(
      pool.query(
        `UPDATE gold_standard_decisions
         SET case_id = $1
         WHERE id = $2`,
        [draftCaseId, decisionId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const result = await pool.query(
      "SELECT case_id, selected_level_code FROM gold_standard_decisions WHERE id = $1",
      [decisionId],
    );
    expect(result.rows[0]).toEqual({
      case_id: validatedCaseId,
      selected_level_code: "A2",
    });
  });
});
