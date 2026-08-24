import { describe, expect, it } from "vitest";
import { previewMethodologyImport } from "../src/application/methodology-import.js";
import {
  GOLD_STANDARD_HEADERS_ES,
  METHODOLOGY_HEADERS_ES,
  SpreadsheetImportError,
  parseGoldStandardSpreadsheet,
  parseMethodologySpreadsheet,
} from "../src/application/spreadsheet-import.js";
import { buildSpreadsheetTemplate } from "../src/application/spreadsheet-templates.js";

const encoder = new TextEncoder();

function csv(headers: readonly string[], rows: Array<Array<string | number | boolean>>, delimiter = ","): Uint8Array {
  const escape = (value: string | number | boolean) => {
    const text = String(value);
    return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return encoder.encode([headers.join(delimiter), ...rows.map((row) => row.map(escape).join(delimiter))].join("\r\n"));
}

function goldRows(methodologyId = "method-1"): Array<Array<string | number | boolean>> {
  return [
    ["GS-001", "Jefatura anonimizada", methodologyId, "CALIBRATION", "Sí", "JEF-001", "Jefatura", "Operaciones", "", "Operaciones", "Descriptivo anónimo", "DIM_A", "A2", "Alcance experto", "JOB_DESCRIPTION", "Responsabilidades", "Coordina el proceso", 231, "G3", "Referencia"],
    ["GS-001", "", "", "", "", "", "", "", "", "", "", "DIM_B", "B1", "Decisión B", "INTERVIEW", "Entrevista", "Confirma autonomía", "", "", ""],
  ];
}

function methodologyRows(): Array<Array<string | number | boolean>> {
  return [
    ["META", "SIMPLE_TABLE", "Metodología tabular", "1.0", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "TOTAL"],
    ["FACTOR", "F1", "Factor", "", "", "Ejemplo", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["DIMENSION", "D1", "Dimensión", "", "F1", "", "Sí", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["LEVEL", "L1", "", "", "D1", "", "", "Básico", "", "", "", "", "", "", "", "", "", "", ""],
    ["LEVEL", "L2", "", "", "D1", "", "", "Avanzado", "", "", "", "", "", "", "", "", "", "", ""],
    ["STEP", "SCORE", "", "", "", "", "", "Puntos", "lookup", "selection:D1", "", "", "", "", "", "", "", "", ""],
    ["LOOKUP", "", "", "", "SCORE", "", "", "", "", "", "", "", "", "", "L1", 100, "", "", ""],
    ["LOOKUP", "", "", "", "SCORE", "", "", "", "", "", "", "", "", "", "L2", 200, "", "", ""],
    ["STEP", "TOTAL", "", "", "", "", "", "Total", "round", "", "", "", "step:SCORE", 0, "", "", "", "", ""],
    ["GRADE", "G1", "Grado 1", "", "", "", "", "", "", "", "", "", "", "", "", "", 0, 150, ""],
    ["GRADE", "G2", "Grado 2", "", "", "", "", "", "", "", "", "", "", "", "", "", 151, 300, ""],
  ];
}

describe("spreadsheet import", () => {
  it("groups flat Gold Standard CSV rows into a canonical historical case", async () => {
    const document = await parseGoldStandardSpreadsheet("gold.csv", csv(GOLD_STANDARD_HEADERS_ES, goldRows()));
    expect(document.cases).toHaveLength(1);
    const item = document.cases[0];
    expect(item?.caseCode).toBe("GS-001");
    expect(item?.partition).toBe("CALIBRATION");
    expect(item?.isAnchor).toBe(true);
    expect(item?.decisions).toHaveLength(2);
    expect(item?.decisions[0]?.evidence?.[0]?.excerpt).toBe("Coordina el proceso");
    expect(item?.expectedTotalPoints).toBe(231);
    expect(item?.expectedGradeCode).toBe("G3");
  });

  it("accepts semicolon CSV and decimal comma numbers", async () => {
    const rows = goldRows();
    rows[0]![17] = "231,5";
    const document = await parseGoldStandardSpreadsheet("gold.csv", csv(GOLD_STANDARD_HEADERS_ES, rows, ";"));
    expect(document.cases[0]?.expectedTotalPoints).toBe(231.5);
  });

  it("rejects conflicting repeated decisions inside one Gold Standard case", async () => {
    const rows = goldRows();
    rows.push(["GS-001", "", "", "", "", "", "", "", "", "", "", "DIM_A", "A3", "", "", "", "", "", "", ""]);
    await expect(parseGoldStandardSpreadsheet("gold.csv", csv(GOLD_STANDARD_HEADERS_ES, rows))).rejects.toMatchObject({
      code: "SPREADSHEET_CONFLICT",
    });
  });

  it("converts methodology CSV records into a semantically valid deterministic definition", async () => {
    const definition = await parseMethodologySpreadsheet("methodology.csv", csv(METHODOLOGY_HEADERS_ES, methodologyRows()));
    const preview = previewMethodologyImport(definition);
    expect(preview.status).toBe("VALID");
    expect(preview.factorCount).toBe(1);
    expect(preview.dimensionCount).toBe(1);
    expect(preview.levelCount).toBe(2);
    expect(preview.scoringStepCount).toBe(2);
    expect(preview.gradeCount).toBe(2);
  });

  it("rejects arbitrary methodology step types from spreadsheets", async () => {
    const rows = methodologyRows();
    rows[5]![8] = "javascript";
    await expect(parseMethodologySpreadsheet("methodology.csv", csv(METHODOLOGY_HEADERS_ES, rows))).rejects.toMatchObject({
      code: "SPREADSHEET_INVALID_STEP_TYPE",
    });
  });

  it("generates usable CSV and XLSX templates", async () => {
    const csvTemplate = await buildSpreadsheetTemplate("gold-standard", "csv");
    expect(csvTemplate.fileName).toBe("compensa-gold-standard.csv");
    expect(typeof csvTemplate.body).toBe("string");
    expect(String(csvTemplate.body)).toContain("codigo_caso");

    const xlsxTemplate = await buildSpreadsheetTemplate("methodology", "xlsx");
    expect(xlsxTemplate.fileName).toBe("compensa-metodologia.xlsx");
    expect(xlsxTemplate.body).toBeInstanceOf(Uint8Array);
    expect((xlsxTemplate.body as Uint8Array).byteLength).toBeGreaterThan(1000);
  });

  it("parses a real XLSX workbook and rejects formula cells", async () => {
    type Cell = { value: unknown };
    type Row = { getCell(index: number): Cell };
    type Worksheet = { addRow(values: unknown[]): Row; getRow(index: number): Row };
    type Workbook = {
      addWorksheet(name: string): Worksheet;
      xlsx: { writeBuffer(): Promise<ArrayBuffer | Uint8Array | Buffer> };
    };
    type WorkbookConstructor = new () => Workbook;
    type ModuleShape = { Workbook?: WorkbookConstructor; default?: { Workbook?: WorkbookConstructor } };
    const module = (await import("@excel.js/exceljs")) as unknown as ModuleShape;
    const WorkbookCtor = module.Workbook ?? module.default?.Workbook;
    expect(WorkbookCtor).toBeDefined();
    if (WorkbookCtor === undefined) throw new Error("Workbook constructor unavailable in test.");

    const workbook = new WorkbookCtor();
    const sheet = workbook.addWorksheet("GoldStandard");
    sheet.addRow([...GOLD_STANDARD_HEADERS_ES]);
    for (const row of goldRows()) sheet.addRow(row);
    const raw = await workbook.xlsx.writeBuffer();
    const bytes = raw instanceof Uint8Array ? new Uint8Array(raw) : new Uint8Array(raw);
    const document = await parseGoldStandardSpreadsheet("gold.xlsx", bytes);
    expect(document.cases[0]?.decisions).toHaveLength(2);

    const formulaWorkbook = new WorkbookCtor();
    const formulaSheet = formulaWorkbook.addWorksheet("GoldStandard");
    formulaSheet.addRow([...GOLD_STANDARD_HEADERS_ES]);
    const dataRow = formulaSheet.addRow(goldRows()[0]!);
    dataRow.getCell(18).value = { formula: "1+1", result: 2 };
    const formulaRaw = await formulaWorkbook.xlsx.writeBuffer();
    const formulaBytes = formulaRaw instanceof Uint8Array ? new Uint8Array(formulaRaw) : new Uint8Array(formulaRaw);
    await expect(parseGoldStandardSpreadsheet("formula.xlsx", formulaBytes)).rejects.toBeInstanceOf(SpreadsheetImportError);
    await expect(parseGoldStandardSpreadsheet("formula.xlsx", formulaBytes)).rejects.toMatchObject({
      code: "SPREADSHEET_FORMULA_NOT_ALLOWED",
    });
  });
});
