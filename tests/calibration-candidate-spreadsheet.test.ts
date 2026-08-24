import { describe, expect, it } from "vitest";
import {
  CALIBRATION_CANDIDATE_HEADERS_ES,
  buildCalibrationCandidateTemplate,
  parseCalibrationCandidateSpreadsheet,
} from "../src/application/calibration-candidate-spreadsheet.js";
import { SpreadsheetImportError } from "../src/application/spreadsheet-import.js";
import { demoMethodology, demoMidLevelSelections } from "../src/fixtures/demo-methodology.js";
import type { CalibrationRunBundle } from "../src/persistence/calibration.js";

const encoder = new TextEncoder();

function csv(rows: string[][], delimiter = ","): Uint8Array {
  const escape = (value: string) =>
    value.includes(delimiter) || /["\r\n]/.test(value)
      ? `"${value.replaceAll('"', '""')}"`
      : value;
  return encoder.encode([
    CALIBRATION_CANDIDATE_HEADERS_ES.join(delimiter),
    ...rows.map((row) => row.map(escape).join(delimiter)),
  ].join("\r\n"));
}

function candidateRows(level = "K2"): string[][] {
  return [
    ["GS-001", "Caso 1", "DOMAIN_KNOWLEDGE", "Domain knowledge", level, "K1 | K2 | K3"],
    ["GS-001", "Caso 1", "KNOWLEDGE_BREADTH", "Knowledge breadth", "B2", "B1 | B2 | B3"],
    ["GS-001", "Caso 1", "PROBLEM_COMPLEXITY", "Problem complexity", "C2", "C1 | C2 | C3"],
    ["GS-001", "Caso 1", "AUTONOMY", "Decision autonomy", "A2", "A1 | A2 | A3"],
    ["GS-001", "Caso 1", "IMPACT_SCOPE", "Impact scope", "S2", "S1 | S2 | S3"],
    ["GS-001", "Caso 1", "PEOPLE_SCOPE", "People scope", "P1", "P0 | P1 | P2"],
  ];
}

function fakeBundle(): CalibrationRunBundle {
  const now = new Date("2026-08-23T00:00:00Z");
  return {
    run: {
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      name: "Calibración Agosto",
      partition: "HOLDOUT",
      methodologyVersionId: "33333333-3333-4333-8333-333333333333",
      candidateSource: "MANUAL",
      candidateLabel: null,
      status: "DRAFT",
      summary: null,
      createdByUserId: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    cases: [{
      id: "44444444-4444-4444-8444-444444444444",
      organizationId: "22222222-2222-4222-8222-222222222222",
      runId: "11111111-1111-4111-8111-111111111111",
      caseId: "55555555-5555-4555-8555-555555555555",
      caseCodeSnapshot: "GS-001",
      anonymizedLabelSnapshot: "Caso 1",
      jobSnapshot: { code: null, name: "Puesto", department: null, area: null, jobFamily: null },
      descriptionSnapshot: null,
      methodologySnapshot: demoMethodology,
      referenceSelections: { ...demoMidLevelSelections, DOMAIN_KNOWLEDGE: "EXPERT_SECRET" },
      referencePoints: 231,
      referenceGradeCode: "G3",
      candidateSelections: null,
      candidatePoints: null,
      candidateGradeCode: null,
      comparison: null,
      evaluatedAt: null,
      createdAt: now,
      updatedAt: now,
    }],
  };
}

describe("calibration candidate spreadsheets", () => {
  it("groups CSV rows into one complete candidate case", async () => {
    const document = await parseCalibrationCandidateSpreadsheet("candidate.csv", csv(candidateRows()));
    expect(document.version).toBe(1);
    expect(document.cases).toHaveLength(1);
    expect(document.cases[0]?.caseCode).toBe("GS-001");
    expect(document.cases[0]?.selections).toEqual(demoMidLevelSelections);
  });

  it("accepts semicolon-delimited CSV", async () => {
    const document = await parseCalibrationCandidateSpreadsheet("candidate.csv", csv(candidateRows(), ";"));
    expect(document.cases[0]?.selections.AUTONOMY).toBe("A2");
  });

  it("rejects conflicting duplicate dimensions", async () => {
    const rows = candidateRows();
    rows.push(["GS-001", "Caso 1", "AUTONOMY", "Decision autonomy", "A3", "A1 | A2 | A3"]);
    await expect(parseCalibrationCandidateSpreadsheet("candidate.csv", csv(rows))).rejects.toMatchObject({
      code: "CALIBRATION_SPREADSHEET_CONFLICT",
    });
  });

  it("builds blind per-run templates without expert selections", async () => {
    const csvTemplate = await buildCalibrationCandidateTemplate(fakeBundle(), "csv");
    expect(csvTemplate.fileName).toContain("calibracion-agosto");
    expect(String(csvTemplate.body)).toContain("GS-001");
    expect(String(csvTemplate.body)).toContain("DOMAIN_KNOWLEDGE");
    expect(String(csvTemplate.body)).toContain("K1 | K2 | K3");
    expect(String(csvTemplate.body)).not.toContain("EXPERT_SECRET");

    const xlsxTemplate = await buildCalibrationCandidateTemplate(fakeBundle(), "xlsx");
    expect(xlsxTemplate.body).toBeInstanceOf(Uint8Array);
    expect((xlsxTemplate.body as Uint8Array).byteLength).toBeGreaterThan(1000);
  });

  it("parses a real XLSX and rejects formulas", async () => {
    type Cell = { value: unknown };
    type Row = { getCell(index: number): Cell };
    type Worksheet = { addRow(values: unknown[]): Row };
    type Workbook = {
      addWorksheet(name: string): Worksheet;
      xlsx: { writeBuffer(): Promise<ArrayBuffer | Uint8Array | Buffer> };
    };
    type WorkbookConstructor = new () => Workbook;
    type ModuleShape = { Workbook?: WorkbookConstructor; default?: { Workbook?: WorkbookConstructor } };
    const module = (await import("@excel.js/exceljs")) as unknown as ModuleShape;
    const WorkbookCtor = module.Workbook ?? module.default?.Workbook;
    if (WorkbookCtor === undefined) throw new Error("Workbook constructor unavailable.");

    const workbook = new WorkbookCtor();
    const sheet = workbook.addWorksheet("Calibration");
    sheet.addRow([...CALIBRATION_CANDIDATE_HEADERS_ES]);
    for (const row of candidateRows()) sheet.addRow(row);
    const raw = await workbook.xlsx.writeBuffer();
    const document = await parseCalibrationCandidateSpreadsheet("candidate.xlsx", new Uint8Array(raw));
    expect(document.cases[0]?.selections.PEOPLE_SCOPE).toBe("P1");

    const formulaWorkbook = new WorkbookCtor();
    const formulaSheet = formulaWorkbook.addWorksheet("Calibration");
    formulaSheet.addRow([...CALIBRATION_CANDIDATE_HEADERS_ES]);
    const dataRow = formulaSheet.addRow(candidateRows()[0]!);
    dataRow.getCell(5).value = { formula: '"K"&"2"', result: "K2" };
    const formulaRaw = await formulaWorkbook.xlsx.writeBuffer();
    await expect(
      parseCalibrationCandidateSpreadsheet("formula.xlsx", new Uint8Array(formulaRaw)),
    ).rejects.toBeInstanceOf(SpreadsheetImportError);
    await expect(
      parseCalibrationCandidateSpreadsheet("formula.xlsx", new Uint8Array(formulaRaw)),
    ).rejects.toMatchObject({ code: "SPREADSHEET_FORMULA_NOT_ALLOWED" });
  });
});
