import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoldStandardImportPreviewService } from "../../src/application/gold-standard-import-preview.js";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { demoMethodology, demoMidLevelSelections } from "../../src/fixtures/demo-methodology.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for Gold Standard import preview integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const previewService = new GoldStandardImportPreviewService(pool);
const goldService = new GoldStandardService(pool);

beforeAll(async () => { await runMigrations(pool); });
beforeEach(async () => { await cleanDatabase(); });
afterAll(async () => { await cleanDatabase(); await pool.end(); });

async function cleanDatabase(): Promise<void> {
  await pool.query(
    `TRUNCATE gold_standard_evidence, gold_standard_decisions, gold_standard_cases,
      security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
}

async function createOrganizationWithMethodology(slug: string) {
  const organization = await repository.createOrganization({
    slug,
    name: `${slug} Corp`,
    countryCode: "PE",
    currencyCode: "PEN",
  });
  const methodology = await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa demo",
    status: "ACTIVE",
  });
  return { organization, methodology };
}

function historicalCase(methodologyVersionId: string, caseCode: string, overrides: Record<string, unknown> = {}) {
  return {
    caseCode,
    anonymizedLabel: `Referencia ${caseCode}`,
    methodologyVersionId,
    job: {
      code: null,
      name: "Jefe de Planeamiento",
      department: "Finanzas",
      area: "Planeamiento",
      jobFamily: "Finanzas",
    },
    description: "Descripción anonimizada.",
    decisions: Object.entries(demoMidLevelSelections).map(([dimensionCode, selectedLevelCode]) => ({
      dimensionCode,
      selectedLevelCode,
      justification: `Juicio experto para ${dimensionCode}.`,
    })),
    expectedTotalPoints: 231,
    expectedGradeCode: "G3",
    ...overrides,
  };
}

describe("Gold Standard import preview", () => {
  it("previews a valid historical case without writing anything", async () => {
    const source = await createOrganizationWithMethodology("preview-valid");
    const document = {
      version: 1,
      cases: [historicalCase(source.methodology.id, "GS-PREVIEW-001")],
    };

    const preview = await previewService.preview(source.organization.id, document);

    expect(preview).toMatchObject({
      totalCases: 1,
      validCases: 1,
      invalidCases: 0,
      canImport: true,
    });
    expect(preview.cases[0]).toMatchObject({
      caseCode: "GS-PREVIEW-001",
      status: "VALID",
      recalculatedPoints: 231,
      recalculatedGradeCode: "G3",
      issues: [],
    });
    expect(await goldService.listCases(source.organization.id)).toEqual([]);
  });

  it("reports score mismatch and an existing case code without mutating data", async () => {
    const source = await createOrganizationWithMethodology("preview-conflicts");
    const existingDocument = {
      version: 1,
      cases: [historicalCase(source.methodology.id, "GS-EXISTING")],
    };
    await goldService.importHistoricalCases(source.organization.id, existingDocument);

    const preview = await previewService.preview(source.organization.id, {
      version: 1,
      cases: [historicalCase(source.methodology.id, "GS-EXISTING", {
        expectedTotalPoints: 999,
        expectedGradeCode: "G9",
      })],
    });

    expect(preview.canImport).toBe(false);
    expect(preview.cases[0]!.status).toBe("INVALID");
    expect(preview.cases[0]!.recalculatedPoints).toBe(231);
    expect(preview.cases[0]!.recalculatedGradeCode).toBe("G3");
    expect(preview.cases[0]!.issues.map((item) => item.code)).toEqual([
      "GOLD_CASE_CODE_EXISTS",
      "GOLD_IMPORT_RESULT_MISMATCH",
    ]);
    expect(await goldService.listCases(source.organization.id)).toHaveLength(1);
  });

  it("reports a methodology from another tenant as invalid without exposing it", async () => {
    const tenantA = await createOrganizationWithMethodology("preview-tenant-a");
    const tenantB = await createOrganizationWithMethodology("preview-tenant-b");

    const preview = await previewService.preview(tenantA.organization.id, {
      version: 1,
      cases: [historicalCase(tenantB.methodology.id, "GS-CROSS-TENANT")],
    });

    expect(preview).toMatchObject({ validCases: 0, invalidCases: 1, canImport: false });
    expect(preview.cases[0]!.issues).toEqual([
      {
        code: "METHODOLOGY_NOT_FOUND",
        message: "Methodology version is not available to this organization.",
      },
    ]);
    expect(await goldService.listCases(tenantA.organization.id)).toEqual([]);
  });
});
