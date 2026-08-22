import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { demoMethodology, demoMidLevelSelections } from "../../src/fixtures/demo-methodology.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for Gold Standard import integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
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

async function createUser(email: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO auth_users (name, email, email_verified)
     VALUES ('Import Admin', $1, true)
     RETURNING id`,
    [email],
  );
  return result.rows[0]!.id as string;
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
      code: `JOB-${caseCode}`,
      name: "Jefe de Planeamiento",
      department: "Finanzas",
      area: "Planeamiento",
      jobFamily: "Finanzas",
    },
    description: "Responsabilidades: Puede aprobar ajustes operativos dentro de políticas definidas.",
    decisions: Object.entries(demoMidLevelSelections).map(([dimensionCode, selectedLevelCode]) => ({
      dimensionCode,
      selectedLevelCode,
      justification: `Juicio experto para ${dimensionCode}.`,
      evidence: dimensionCode === "AUTONOMY"
        ? [{
            sourceType: "JOB_DESCRIPTION",
            sourceSection: "Responsabilidades",
            excerpt: "Puede aprobar ajustes operativos dentro de políticas definidas.",
          }]
        : [],
    })),
    expectedTotalPoints: 231,
    expectedGradeCode: "G3",
    ...overrides,
  };
}

describe("Gold Standard historical bulk import", () => {
  it("imports multiple historical expert cases atomically with snapshots and metadata", async () => {
    const source = await createOrganizationWithMethodology("historical-success");
    const creatorUserId = await createUser("import-admin@example.com");

    const result = await goldService.importHistoricalCases(source.organization.id, {
      version: 1,
      cases: [
        historicalCase(source.methodology.id, "GS-HIST-001", {
          partition: "CALIBRATION",
          isAnchor: true,
        }),
        historicalCase(source.methodology.id, "GS-HIST-002", {
          partition: "HOLDOUT",
          isAnchor: false,
        }),
      ],
    }, creatorUserId);

    expect(result.imported).toHaveLength(2);
    expect(result.imported[0]!.case).toMatchObject({
      caseCode: "GS-HIST-001",
      sourceType: "IMPORT",
      sourceValuationId: null,
      partition: "CALIBRATION",
      isAnchor: true,
      status: "VALIDATED",
      expectedTotalPoints: 231,
      expectedGradeCode: "G3",
      createdByUserId: creatorUserId,
      expertUserId: null,
      jobDescriptionVersionId: null,
    });
    expect(result.imported[0]!.case.methodologySnapshot).toEqual(demoMethodology);
    expect(result.imported[0]!.decisions).toHaveLength(6);
    expect(result.imported[0]!.evidence).toHaveLength(1);
    expect(result.imported[1]!.case.partition).toBe("HOLDOUT");
    expect(await goldService.listCases(source.organization.id)).toHaveLength(2);
  });

  it("rolls back the entire batch when a later case references another tenant methodology", async () => {
    const tenantA = await createOrganizationWithMethodology("historical-tenant-a");
    const tenantB = await createOrganizationWithMethodology("historical-tenant-b");

    await expect(goldService.importHistoricalCases(tenantA.organization.id, {
      version: 1,
      cases: [
        historicalCase(tenantA.methodology.id, "GS-ROLLBACK-1"),
        historicalCase(tenantB.methodology.id, "GS-ROLLBACK-2"),
      ],
    })).rejects.toMatchObject({ code: "METHODOLOGY_NOT_FOUND" });

    expect(await goldService.listCases(tenantA.organization.id)).toEqual([]);
    expect(await goldService.listCases(tenantB.organization.id)).toEqual([]);
  });

  it("rejects a declared historical score mismatch and leaves no partial reference", async () => {
    const source = await createOrganizationWithMethodology("historical-mismatch");

    await expect(goldService.importHistoricalCases(source.organization.id, {
      version: 1,
      cases: [
        historicalCase(source.methodology.id, "GS-MISMATCH-1"),
        historicalCase(source.methodology.id, "GS-MISMATCH-2", {
          expectedTotalPoints: 999,
          expectedGradeCode: "G9",
        }),
      ],
    })).rejects.toMatchObject({ code: "GOLD_IMPORT_RESULT_MISMATCH" });

    expect(await goldService.listCases(source.organization.id)).toEqual([]);
  });

  it("rejects invalid expert selections before freezing the historical case", async () => {
    const source = await createOrganizationWithMethodology("historical-invalid-selection");
    const invalidSelections = Object.entries(demoMidLevelSelections).map(([dimensionCode, selectedLevelCode]) => ({
      dimensionCode,
      selectedLevelCode: dimensionCode === "AUTONOMY" ? "A99" : selectedLevelCode,
    }));

    await expect(goldService.importHistoricalCases(source.organization.id, {
      version: 1,
      cases: [historicalCase(source.methodology.id, "GS-INVALID", {
        decisions: invalidSelections,
        expectedTotalPoints: undefined,
        expectedGradeCode: undefined,
      })],
    })).rejects.toMatchObject({ code: "GOLD_IMPORT_NOT_REPRODUCIBLE" });

    expect(await goldService.listCases(source.organization.id)).toEqual([]);
  });
});
