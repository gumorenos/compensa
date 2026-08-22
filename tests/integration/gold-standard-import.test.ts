import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import { demoMethodology, demoMidLevelSelections } from "../../src/fixtures/demo-methodology.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for Gold Standard import integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);
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

async function createOrganizationWithApprovedValuations(slug: string, count: number) {
  const organization = await repository.createOrganization({
    slug,
    name: `${slug} Corp`,
    countryCode: "PE",
    currencyCode: "PEN",
  });
  const job = await repository.createJob(organization.id, {
    code: `${slug.toUpperCase()}-001`,
    name: "Jefe de Planeamiento",
    department: "Finanzas",
    area: "Planeamiento",
    jobFamily: "Finanzas",
  });
  const methodology = await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa demo",
    status: "ACTIVE",
  });
  await repository.createJobDescriptionVersion(organization.id, job.id, {
    content: "Responsabilidades: Puede aprobar ajustes operativos dentro de políticas definidas.",
    sourceLabel: "Descriptivo experto",
  });

  const valuations = [];
  for (let index = 0; index < count; index += 1) {
    const valuation = await valuationService.startValuation(organization.id, job.id, methodology.id);
    for (const [dimensionCode, selectedLevelCode] of Object.entries(demoMidLevelSelections)) {
      await valuationService.saveDecision(organization.id, valuation.id, { dimensionCode, selectedLevelCode });
      await valuationService.saveDecisionSupport(organization.id, valuation.id, {
        dimensionCode,
        justification: `Juicio experto ${index + 1} para ${dimensionCode}.`,
      });
    }
    await valuationService.submitForReview(organization.id, valuation.id, "Lista para revisión.");
    valuations.push(await valuationService.approve(organization.id, valuation.id, "Aprobada."));
  }
  return { organization, valuations };
}

describe("Gold Standard bulk import", () => {
  it("imports multiple approved valuations atomically with metadata", async () => {
    const source = await createOrganizationWithApprovedValuations("bulk-success", 2);

    const result = await goldService.importApprovedValuations(source.organization.id, {
      version: 1,
      cases: [
        {
          valuationId: source.valuations[0]!.id,
          caseCode: "GS-BULK-001",
          anonymizedLabel: "Referencia histórica 001",
          partition: "CALIBRATION",
          isAnchor: true,
        },
        {
          valuationId: source.valuations[1]!.id,
          caseCode: "GS-BULK-002",
          anonymizedLabel: "Referencia histórica 002",
          partition: "HOLDOUT",
          isAnchor: false,
        },
      ],
    }, "admin-user-id");

    expect(result.imported).toHaveLength(2);
    expect(result.imported[0]!.case).toMatchObject({
      caseCode: "GS-BULK-001",
      partition: "CALIBRATION",
      isAnchor: true,
      status: "VALIDATED",
      expectedTotalPoints: 231,
      expectedGradeCode: "G3",
      createdByUserId: "admin-user-id",
      expertUserId: null,
    });
    expect(result.imported[1]!.case.partition).toBe("HOLDOUT");
    expect(await goldService.listCases(source.organization.id)).toHaveLength(2);
  });

  it("rolls back the entire batch when a later source belongs to another organization", async () => {
    const tenantA = await createOrganizationWithApprovedValuations("bulk-tenant-a", 1);
    const tenantB = await createOrganizationWithApprovedValuations("bulk-tenant-b", 1);

    await expect(goldService.importApprovedValuations(tenantA.organization.id, {
      version: 1,
      cases: [
        {
          valuationId: tenantA.valuations[0]!.id,
          caseCode: "GS-ROLLBACK-1",
          anonymizedLabel: "Debe revertirse",
        },
        {
          valuationId: tenantB.valuations[0]!.id,
          caseCode: "GS-ROLLBACK-2",
          anonymizedLabel: "Tenant incorrecto",
        },
      ],
    })).rejects.toMatchObject({ code: "VALUATION_NOT_FOUND" });

    expect(await goldService.listCases(tenantA.organization.id)).toEqual([]);
    expect(await goldService.listCases(tenantB.organization.id)).toEqual([]);
  });

  it("rejects an already captured source and preserves prior references", async () => {
    const source = await createOrganizationWithApprovedValuations("bulk-existing", 2);
    await goldService.captureApprovedValuation(source.organization.id, source.valuations[0]!.id, {
      caseCode: "GS-EXISTING",
      anonymizedLabel: "Existente",
    });

    await expect(goldService.importApprovedValuations(source.organization.id, {
      version: 1,
      cases: [
        {
          valuationId: source.valuations[1]!.id,
          caseCode: "GS-NEW-WOULD-ROLLBACK",
          anonymizedLabel: "Nueva",
        },
        {
          valuationId: source.valuations[0]!.id,
          caseCode: "GS-DUPLICATE-SOURCE",
          anonymizedLabel: "Duplicada",
        },
      ],
    })).rejects.toMatchObject({ code: "GOLD_CASE_ALREADY_CAPTURED" });

    const cases = await goldService.listCases(source.organization.id);
    expect(cases).toHaveLength(1);
    expect(cases[0]!.caseCode).toBe("GS-EXISTING");
  });
});
