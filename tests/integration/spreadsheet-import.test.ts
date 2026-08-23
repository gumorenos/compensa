import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoldStandardImportPreviewService } from "../../src/application/gold-standard-import-preview.js";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { MethodologyAdminService } from "../../src/application/methodology-admin-service.js";
import {
  GOLD_STANDARD_HEADERS_ES,
  METHODOLOGY_HEADERS_ES,
  parseGoldStandardSpreadsheet,
  parseMethodologySpreadsheet,
} from "../../src/application/spreadsheet-import.js";
import { CompensaRepository, createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for spreadsheet integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const methodologyService = new MethodologyAdminService(pool);
const goldService = new GoldStandardService(pool);
const previewService = new GoldStandardImportPreviewService(pool);
const encoder = new TextEncoder();

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

function csv(headers: readonly string[], rows: Array<Array<string | number | boolean>>): Uint8Array {
  const escape = (value: string | number | boolean) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return encoder.encode([headers.join(","), ...rows.map((row) => row.map(escape).join(","))].join("\r\n"));
}

function simpleMethodologyRows(): Array<Array<string | number | boolean>> {
  return [
    ["META", "SHEET_METHOD", "Metodología desde hoja", "1.0", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "TOTAL"],
    ["FACTOR", "F1", "Factor", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["DIMENSION", "D1", "Dimensión", "", "F1", "", "Sí", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["LEVEL", "L1", "", "", "D1", "", "", "Básico", "", "", "", "", "", "", "", "", "", "", ""],
    ["LEVEL", "L2", "", "", "D1", "", "", "Avanzado", "", "", "", "", "", "", "", "", "", "", ""],
    ["STEP", "SCORE", "", "", "", "", "", "", "lookup", "selection:D1", "", "", "", "", "", "", "", "", ""],
    ["LOOKUP", "", "", "", "SCORE", "", "", "", "", "", "", "", "", "", "L1", 100, "", "", ""],
    ["LOOKUP", "", "", "", "SCORE", "", "", "", "", "", "", "", "", "", "L2", 200, "", "", ""],
    ["STEP", "TOTAL", "", "", "", "", "", "", "round", "", "", "", "step:SCORE", 0, "", "", "", "", ""],
    ["GRADE", "G1", "Grado 1", "", "", "", "", "", "", "", "", "", "", "", "", "", 0, 150, ""],
    ["GRADE", "G2", "Grado 2", "", "", "", "", "", "", "", "", "", "", "", "", "", 151, 300, ""],
  ];
}

describe("spreadsheet service roundtrip", () => {
  it("imports a methodology spreadsheet and then a historical Gold Standard spreadsheet using it", async () => {
    const organization = await repository.createOrganization({
      slug: "sheet-roundtrip",
      name: "Spreadsheet Corp",
      countryCode: "PE",
      currencyCode: "PEN",
    });

    const definition = await parseMethodologySpreadsheet(
      "methodology.csv",
      csv(METHODOLOGY_HEADERS_ES, simpleMethodologyRows()),
    );
    const methodologyPreview = await methodologyService.preview(organization.id, definition);
    expect(methodologyPreview.status).toBe("VALID");
    const methodology = await methodologyService.importActive(
      organization.id,
      definition,
      "Metodología interna autorizada para QA",
    );
    expect(methodology.code).toBe("SHEET_METHOD");
    expect(methodology.status).toBe("ACTIVE");

    const goldRows: Array<Array<string | number | boolean>> = [[
      "GS-SHEET-001",
      "Puesto anonimizado",
      methodology.id,
      "HOLDOUT",
      "No",
      "JOB-001",
      "Puesto de referencia",
      "Operaciones",
      "",
      "Operaciones",
      "Descriptivo anonimizado.",
      "D1",
      "L2",
      "Juicio experto.",
      "JOB_DESCRIPTION",
      "Responsabilidades",
      "Opera con alcance avanzado.",
      200,
      "G2",
      "QA spreadsheet",
    ]];
    const goldDocument = await parseGoldStandardSpreadsheet(
      "gold.csv",
      csv(GOLD_STANDARD_HEADERS_ES, goldRows),
    );
    const goldPreview = await previewService.preview(organization.id, goldDocument);
    expect(goldPreview.canImport).toBe(true);
    expect(goldPreview.cases[0]).toMatchObject({
      caseCode: "GS-SHEET-001",
      recalculatedPoints: 200,
      recalculatedGradeCode: "G2",
      status: "VALID",
    });

    const imported = await goldService.importHistoricalCases(organization.id, goldDocument);
    expect(imported.imported).toHaveLength(1);
    expect(imported.imported[0]?.case).toMatchObject({
      caseCode: "GS-SHEET-001",
      expectedTotalPoints: 200,
      expectedGradeCode: "G2",
      partition: "HOLDOUT",
      status: "VALIDATED",
    });
    expect(imported.imported[0]?.decisions).toHaveLength(1);
    expect(imported.imported[0]?.evidence).toHaveLength(1);
  });

  it("keeps cross-tenant methodology IDs invalid after spreadsheet normalization", async () => {
    const organizationA = await repository.createOrganization({ slug: "sheet-a", name: "A", currencyCode: "PEN" });
    const organizationB = await repository.createOrganization({ slug: "sheet-b", name: "B", currencyCode: "PEN" });
    const definition = await parseMethodologySpreadsheet("methodology.csv", csv(METHODOLOGY_HEADERS_ES, simpleMethodologyRows()));
    const methodologyB = await methodologyService.importActive(organizationB.id, definition, "Tenant B");

    const rows: Array<Array<string | number | boolean>> = [[
      "GS-CROSS-SHEET", "Cross tenant", methodologyB.id, "UNASSIGNED", "No", "", "Puesto", "", "", "", "", "D1", "L2", "", "", "", "", 200, "G2", "",
    ]];
    const document = await parseGoldStandardSpreadsheet("gold.csv", csv(GOLD_STANDARD_HEADERS_ES, rows));
    const preview = await previewService.preview(organizationA.id, document);
    expect(preview.canImport).toBe(false);
    expect(preview.invalidCases).toBe(1);
    expect(preview.cases[0]?.issues.some((issue) => issue.code === "METHODOLOGY_NOT_FOUND")).toBe(true);
  });
});
