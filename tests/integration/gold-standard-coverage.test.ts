import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoldStandardCoverageService } from "../../src/application/gold-standard-coverage.js";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { demoMethodology, demoMidLevelSelections } from "../../src/fixtures/demo-methodology.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for Gold Standard coverage integration tests.");
}

const pool = createPool(databaseUrl);
const core = new CompensaRepository(pool);
const gold = new GoldStandardService(pool);
const coverage = new GoldStandardCoverageService(pool);

beforeAll(async () => { await runMigrations(pool); });
beforeEach(async () => { await cleanDatabase(); });
afterAll(async () => { await cleanDatabase(); await pool.end(); });

async function cleanDatabase(): Promise<void> {
  await pool.query(
    `TRUNCATE calibration_run_cases, calibration_runs,
      gold_standard_evidence, gold_standard_decisions, gold_standard_cases,
      security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
}

async function setupOrganization(slug: string) {
  const organization = await core.createOrganization({
    slug,
    name: `${slug} Corp`,
    countryCode: "PE",
    currencyCode: "PEN",
  });
  const methodology = await core.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa demo",
    status: "ACTIVE",
  });
  return { organization, methodology };
}

function decisions(withEvidence: boolean) {
  return Object.entries(demoMidLevelSelections).map(([dimensionCode, selectedLevelCode], index) => ({
    dimensionCode,
    selectedLevelCode,
    justification: `Juicio experto ${dimensionCode}`,
    ...(withEvidence && index === 0
      ? {
          evidence: [{
            sourceType: "OTHER" as const,
            sourceSection: "Fuente anonimizada",
            excerpt: "Evidencia verificable de ejemplo.",
          }],
        }
      : {}),
  }));
}

describe("Gold Standard coverage service", () => {
  it("summarizes only the requested organization and derives evidence quality from persisted rows", async () => {
    const tenantA = await setupOrganization("coverage-a");
    const tenantB = await setupOrganization("coverage-b");

    await gold.importHistoricalCases(tenantA.organization.id, {
      version: 1,
      cases: [
        {
          caseCode: "A-CAL",
          anonymizedLabel: "Referencia A calibración",
          methodologyVersionId: tenantA.methodology.id,
          partition: "CALIBRATION",
          isAnchor: true,
          job: {
            code: "A-1",
            name: "Jefatura A",
            department: "Operaciones",
            area: "Planeamiento",
            jobFamily: "Operaciones",
          },
          description: "Descriptivo A",
          decisions: decisions(true),
          expectedTotalPoints: 231,
          expectedGradeCode: "G3",
        },
        {
          caseCode: "A-HOLD",
          anonymizedLabel: "Referencia A holdout",
          methodologyVersionId: tenantA.methodology.id,
          partition: "HOLDOUT",
          job: {
            code: "A-2",
            name: "Analista A",
            department: "Finanzas",
            area: null,
            jobFamily: null,
          },
          description: "Descriptivo B",
          decisions: decisions(false),
          expectedTotalPoints: 231,
          expectedGradeCode: "G3",
        },
      ],
    });

    await gold.importHistoricalCases(tenantB.organization.id, {
      version: 1,
      cases: [{
        caseCode: "B-ONLY",
        anonymizedLabel: "Referencia de otro tenant",
        methodologyVersionId: tenantB.methodology.id,
        partition: "CALIBRATION",
        job: {
          code: "B-1",
          name: "Puesto B",
          department: "Tecnología",
          area: null,
          jobFamily: "Tecnología",
        },
        description: "No debe aparecer en tenant A",
        decisions: decisions(true),
        expectedTotalPoints: 231,
        expectedGradeCode: "G3",
      }],
    });

    const report = await coverage.getReport(tenantA.organization.id);
    expect(report.totals).toMatchObject({
      totalCases: 2,
      validatedCases: 2,
      calibrationCases: 1,
      holdoutCases: 1,
      anchorCases: 1,
    });
    expect(report.methodologies).toHaveLength(1);
    const methodology = report.methodologies[0]!;
    expect(methodology.methodologyVersionId).toBe(tenantA.methodology.id);
    expect(methodology.casesWithEvidence).toBe(1);
    expect(methodology.casesWithCompleteRequiredDecisions).toBe(2);
    expect(methodology.casesWithCompleteJustifications).toBe(2);
    expect(methodology.jobFamilies).toEqual([
      { code: "Operaciones", label: "Operaciones", count: 1 },
      { code: "Sin familia", label: "Sin familia", count: 1 },
    ]);
    expect(JSON.stringify(report)).not.toContain("Tecnología");
    expect(JSON.stringify(report)).not.toContain("B-ONLY");
  });
});
