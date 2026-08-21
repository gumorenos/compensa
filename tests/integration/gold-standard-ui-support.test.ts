import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoMethodology, demoMidLevelSelections } from "../../src/fixtures/demo-methodology.js";
import { updateGoldStandardAnchor } from "../../src/persistence/gold-standard-management.js";
import { GoldStandardRepository } from "../../src/persistence/gold-standard.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for Gold Standard UI support integration tests.");
}

const pool = createPool(databaseUrl);
const core = new CompensaRepository(pool);
const gold = new GoldStandardRepository(pool);

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

describe("Gold Standard UI persistence support", () => {
  it("changes anchor status only after the reference is validated", async () => {
    const organization = await core.createOrganization({
      slug: "gold-ui-anchor",
      name: "Gold UI Anchor Corp",
      currencyCode: "PEN",
    });
    const methodology = await core.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Compensa demo",
      status: "ACTIVE",
    });

    const draft = await gold.createCase({
      organizationId: organization.id,
      caseCode: "GS-ANCHOR-001",
      anonymizedLabel: "Referencia anonimizada",
      sourceType: "IMPORT",
      methodologyVersionId: methodology.id,
      status: "DRAFT",
      jobSnapshot: {
        code: "REF-001",
        name: "Referencia",
        department: "Finanzas",
        area: "Planeamiento",
        jobFamily: "Finanzas",
      },
      methodologySnapshot: demoMethodology,
    });

    for (const [dimensionCode, selectedLevelCode] of Object.entries(demoMidLevelSelections)) {
      await gold.createDecision({
        organizationId: organization.id,
        caseId: draft.id,
        dimensionCode,
        selectedLevelCode,
        justification: `Referencia experta ${dimensionCode}`,
      });
    }

    await expect(
      updateGoldStandardAnchor(organization.id, draft.id, true, pool),
    ).rejects.toMatchObject({ code: "GOLD_CASE_NOT_VALIDATED" });

    await gold.validateCase(organization.id, draft.id, 231, "G3");
    await updateGoldStandardAnchor(organization.id, draft.id, true, pool);
    expect((await gold.getCase(organization.id, draft.id))?.isAnchor).toBe(true);

    await updateGoldStandardAnchor(organization.id, draft.id, false, pool);
    expect((await gold.getCase(organization.id, draft.id))?.isAnchor).toBe(false);
  });
});
