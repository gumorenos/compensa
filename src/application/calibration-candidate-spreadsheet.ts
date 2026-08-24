import type { ValuationSelections } from "../domain/methodology.js";
import type { CalibrationRunBundle } from "../persistence/calibration.js";
import {
  MAX_SPREADSHEET_BYTES,
  MAX_SPREADSHEET_COLUMNS,
  MAX_SPREADSHEET_ROWS,
  SpreadsheetImportError,
} from "./spreadsheet-import.js";

const MAX_CELL_CHARS = 100_000;

export const CALIBRATION_CANDIDATE_HEADERS_ES = [
  "codigo_caso",
  "etiqueta_anonima",
  "codigo_dimension",
  "dimension",
  "codigo_nivel",
  "niveles_permitidos",
] as const;

export interface CalibrationCandidateImportCase {
  caseCode: string;
  selections: ValuationSelections;
}

export interface CalibrationCandidateImportDocument {
  version: 1;
  cases: CalibrationCandidateImportCase[];
}

export interface CalibrationCandidateTemplate {
  fileName: string;
  contentType: string;
  body: string | Uint8Array;
}

type Scalar = string | number | boolean | null;
interface TabularRow { rowNumber: number; values: Record<string, Scalar>; }
interface TabularData { headers: string[]; rows: TabularRow[]; }

const CASE_ALIASES = ["codigo_caso", "case_code", "casecode"] as const;
const DIMENSION_ALIASES = ["codigo_dimension", "dimension_code"] as const;
const LEVEL_ALIASES = ["codigo_nivel", "level_code", "selected_level_code"] as const;

export async function parseCalibrationCandidateSpreadsheet(
  fileName: string,
  bytes: Uint8Array,
): Promise<CalibrationCandidateImportDocument> {
  const table = await loadTabular(fileName, bytes, "Calibration");
  ensureHeader(table, CASE_ALIASES, "codigo_caso");
  ensureHeader(table, DIMENSION_ALIASES, "codigo_dimension");
  ensureHeader(table, LEVEL_ALIASES, "codigo_nivel");

  const cases = new Map<string, Map<string, string>>();
  for (const row of table.rows) {
    const caseCode = requiredText(row, CASE_ALIASES, "codigo_caso");
    const dimensionCode = requiredText(row, DIMENSION_ALIASES, "codigo_dimension");
    const levelCode = requiredText(row, LEVEL_ALIASES, "codigo_nivel");
    let selections = cases.get(caseCode);
    if (selections === undefined) {
      selections = new Map<string, string>();
      cases.set(caseCode, selections);
    }
    const existing = selections.get(dimensionCode);
    if (existing !== undefined && existing !== levelCode) {
      throw new SpreadsheetImportError(
        "CALIBRATION_SPREADSHEET_CONFLICT",
        `Fila ${row.rowNumber}: ${caseCode}/${dimensionCode} aparece con niveles distintos (${existing} vs ${levelCode}).`,
        row.rowNumber,
        "codigo_nivel",
      );
    }
    selections.set(dimensionCode, levelCode);
  }

  if (cases.size === 0) {
    throw new SpreadsheetImportError(
      "CALIBRATION_SPREADSHEET_EMPTY",
      "El archivo no contiene decisiones candidatas.",
    );
  }

  return {
    version: 1,
    cases: [...cases.entries()].map(([caseCode, selections]) => ({
      caseCode,
      selections: Object.fromEntries(selections),
    })),
  };
}

export async function buildCalibrationCandidateTemplate(
  bundle: CalibrationRunBundle,
  format: "csv" | "xlsx",
): Promise<CalibrationCandidateTemplate> {
  const rows = templateRows(bundle);
  const safeRun = sanitizeFilePart(bundle.run.name);
  if (format === "csv") {
    const body = [
      CALIBRATION_CANDIDATE_HEADERS_ES.map(csvCell).join(","),
      ...rows.map((row) => row.map((value) => csvCell(value)).join(",")),
    ].join("\r\n");
    return {
      fileName: `compensa-calibracion-${safeRun}.csv`,
      contentType: "text/csv; charset=utf-8",
      body: `\uFEFF${body}\r\n`,
    };
  }

  type Worksheet = {
    addRow(values: unknown[]): unknown;
    columns?: Array<{ width?: number }>;
    getRow(index: number): { font?: unknown; fill?: unknown; alignment?: unknown };
    views?: unknown;
  };
  type Workbook = {
    addWorksheet(name: string): Worksheet;
    xlsx: { writeBuffer(): Promise<ArrayBuffer | Uint8Array | Buffer> };
  };
  type WorkbookConstructor = new () => Workbook;
  type ModuleShape = { Workbook?: WorkbookConstructor; default?: { Workbook?: WorkbookConstructor } };

  const excelModule = (await import("@excel.js/exceljs")) as unknown as ModuleShape;
  const WorkbookCtor = excelModule.Workbook ?? excelModule.default?.Workbook;
  if (WorkbookCtor === undefined) throw new Error("Spreadsheet engine is unavailable.");
  const workbook = new WorkbookCtor();
  const instructions = workbook.addWorksheet("Instrucciones");
  const target = workbook.addWorksheet("Calibration");

  target.addRow([...CALIBRATION_CANDIDATE_HEADERS_ES]);
  for (const row of rows) target.addRow(row);
  styleHeader(target);
  target.columns = [18, 28, 22, 30, 18, 36].map((width) => ({ width }));
  target.views = [{ state: "frozen", ySplit: 1 }];

  instructions.addRow(["Compensa · candidatos de calibración"]);
  instructions.addRow(["Corrida", bundle.run.name]);
  instructions.addRow(["Partición", bundle.run.partition]);
  instructions.addRow(["Uso", "Completa únicamente codigo_nivel. No cambies codigo_caso ni codigo_dimension."]);
  instructions.addRow(["Niveles", "Usa uno de los códigos mostrados en niveles_permitidos."]);
  instructions.addRow(["Holdout", "La plantilla nunca contiene decisiones expertas. En HOLDOUT los resultados seguirán ocultos hasta completar la corrida."]);
  instructions.addRow(["Seguridad", "No se admiten fórmulas. Guarda valores simples."]);
  instructions.columns = [{ width: 24 }, { width: 100 }];
  instructions.getRow(1).font = { bold: true, size: 16 };

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    fileName: `compensa-calibracion-${safeRun}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer),
  };
}

function templateRows(bundle: CalibrationRunBundle): string[][] {
  const rows: string[][] = [];
  for (const item of bundle.cases) {
    for (const factor of item.methodologySnapshot.factors) {
      for (const dimension of factor.dimensions) {
        rows.push([
          item.caseCodeSnapshot,
          item.anonymizedLabelSnapshot,
          dimension.code,
          dimension.name,
          item.candidateSelections?.[dimension.code] ?? "",
          dimension.levels.map((level) => level.code).join(" | "),
        ]);
      }
    }
  }
  return rows;
}

async function loadTabular(
  fileName: string,
  bytes: Uint8Array,
  preferredSheet: string,
): Promise<TabularData> {
  if (bytes.byteLength === 0) {
    throw new SpreadsheetImportError("SPREADSHEET_EMPTY_FILE", "El archivo está vacío.");
  }
  if (bytes.byteLength > MAX_SPREADSHEET_BYTES) {
    throw new SpreadsheetImportError(
      "SPREADSHEET_TOO_LARGE",
      `El archivo supera ${Math.floor(MAX_SPREADSHEET_BYTES / 1024 / 1024)} MiB.`,
    );
  }
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "csv") {
    return matrixToTable(parseCsv(new TextDecoder("utf-8", { fatal: false }).decode(bytes)));
  }
  if (extension !== "xlsx") {
    throw new SpreadsheetImportError("SPREADSHEET_UNSUPPORTED_TYPE", "Solo se admiten archivos .xlsx o .csv.");
  }
  return loadXlsx(bytes, preferredSheet);
}

async function loadXlsx(bytes: Uint8Array, preferredSheet: string): Promise<TabularData> {
  type Cell = { value: unknown };
  type Row = { getCell(index: number): Cell };
  type Worksheet = {
    name: string;
    rowCount: number;
    columnCount: number;
    actualRowCount?: number;
    actualColumnCount?: number;
    getRow(index: number): Row;
  };
  type Workbook = { worksheets: Worksheet[]; xlsx: { load(data: Buffer): Promise<unknown> } };
  type WorkbookConstructor = new () => Workbook;
  type ModuleShape = { Workbook?: WorkbookConstructor; default?: { Workbook?: WorkbookConstructor } };

  const excelModule = (await import("@excel.js/exceljs")) as unknown as ModuleShape;
  const WorkbookCtor = excelModule.Workbook ?? excelModule.default?.Workbook;
  if (WorkbookCtor === undefined) {
    throw new SpreadsheetImportError("SPREADSHEET_ENGINE_UNAVAILABLE", "No se pudo inicializar el lector XLSX.");
  }
  const workbook = new WorkbookCtor();
  try {
    await workbook.xlsx.load(Buffer.from(bytes));
  } catch {
    throw new SpreadsheetImportError("SPREADSHEET_INVALID_XLSX", "El archivo XLSX está dañado o no puede interpretarse.");
  }
  const worksheet = workbook.worksheets.find(
    (sheet) => sheet.name.toLowerCase() === preferredSheet.toLowerCase(),
  ) ?? (workbook.worksheets.length === 1 ? workbook.worksheets[0] : undefined);
  if (worksheet === undefined) {
    throw new SpreadsheetImportError(
      "SPREADSHEET_SHEET_NOT_FOUND",
      `El XLSX debe incluir una hoja llamada ${preferredSheet}.`,
    );
  }
  const rowCount = Math.max(worksheet.actualRowCount ?? 0, worksheet.rowCount);
  const columnCount = Math.max(worksheet.actualColumnCount ?? 0, worksheet.columnCount);
  if (rowCount > MAX_SPREADSHEET_ROWS + 1) {
    throw new SpreadsheetImportError("SPREADSHEET_TOO_MANY_ROWS", `La hoja supera ${MAX_SPREADSHEET_ROWS} filas de datos.`);
  }
  if (columnCount > MAX_SPREADSHEET_COLUMNS) {
    throw new SpreadsheetImportError("SPREADSHEET_TOO_MANY_COLUMNS", `La hoja supera ${MAX_SPREADSHEET_COLUMNS} columnas.`);
  }

  const matrix: Scalar[][] = [];
  for (let rowIndex = 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const values: Scalar[] = [];
    let nonEmpty = false;
    for (let columnIndex = 1; columnIndex <= worksheet.columnCount; columnIndex += 1) {
      const value = excelCellValue(row.getCell(columnIndex).value, rowIndex, columnIndex);
      if (!isBlank(value)) nonEmpty = true;
      values.push(value);
    }
    if (nonEmpty) matrix.push(values);
  }
  return matrixToTable(matrix);
}

function excelCellValue(value: unknown, row: number, column: number): Scalar {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return boundedString(value, row, String(column));
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if ("formula" in object || "sharedFormula" in object) {
      throw new SpreadsheetImportError(
        "SPREADSHEET_FORMULA_NOT_ALLOWED",
        `No se permiten fórmulas en celdas de importación (fila ${row}, columna ${column}).`,
        row,
        String(column),
      );
    }
    if (Array.isArray(object.richText)) {
      const joined = object.richText.map((part) =>
        typeof part === "object" && part !== null && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      ).join("");
      return boundedString(joined, row, String(column));
    }
    if (typeof object.text === "string") return boundedString(object.text, row, String(column));
  }
  throw new SpreadsheetImportError(
    "SPREADSHEET_UNSUPPORTED_CELL",
    `Tipo de celda no soportado en fila ${row}, columna ${column}.`,
    row,
    String(column),
  );
}

function matrixToTable(matrix: Scalar[][]): TabularData {
  if (matrix.length === 0) {
    throw new SpreadsheetImportError("SPREADSHEET_EMPTY", "El archivo no contiene filas.");
  }
  const rawHeaders = matrix[0] ?? [];
  const headers = rawHeaders.map((value, index) => {
    const text = value === null ? "" : String(value).trim();
    if (text === "") {
      throw new SpreadsheetImportError("SPREADSHEET_EMPTY_HEADER", `La columna ${index + 1} no tiene encabezado.`);
    }
    return normalizeHeader(text);
  });
  if (headers.length > MAX_SPREADSHEET_COLUMNS) {
    throw new SpreadsheetImportError("SPREADSHEET_TOO_MANY_COLUMNS", `El archivo supera ${MAX_SPREADSHEET_COLUMNS} columnas.`);
  }
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) {
      throw new SpreadsheetImportError("SPREADSHEET_DUPLICATE_HEADER", `Encabezado duplicado: ${header}.`);
    }
    seen.add(header);
  }

  const rows: TabularRow[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    if (rows.length >= MAX_SPREADSHEET_ROWS) {
      throw new SpreadsheetImportError("SPREADSHEET_TOO_MANY_ROWS", `El archivo supera ${MAX_SPREADSHEET_ROWS} filas de datos.`);
    }
    const raw = matrix[index] ?? [];
    const values: Record<string, Scalar> = {};
    let nonEmpty = false;
    for (let column = 0; column < headers.length; column += 1) {
      const header = headers[column];
      if (header === undefined) continue;
      const value = raw[column] ?? null;
      if (!isBlank(value)) nonEmpty = true;
      values[header] = typeof value === "string" ? boundedString(value, index + 1, header) : value;
    }
    if (nonEmpty) rows.push({ rowNumber: index + 1, values });
  }
  return { headers, rows };
}

function parseCsv(input: string): Scalar[][] {
  const text = input.replace(/^\uFEFF/, "");
  const candidates = [",", ";", "\t"].map((delimiter) => ({ delimiter, matrix: parseDelimited(text, delimiter) }));
  candidates.sort((left, right) => (right.matrix[0]?.length ?? 0) - (left.matrix[0]?.length ?? 0));
  const best = candidates[0];
  if (best === undefined || (best.matrix[0]?.length ?? 0) < 2) {
    throw new SpreadsheetImportError(
      "SPREADSHEET_CSV_DELIMITER",
      "No se pudo detectar un CSV con columnas separadas por coma, punto y coma o tabulación.",
    );
  }
  return best.matrix;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let fieldValue = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === undefined) continue;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { fieldValue += '"'; index += 1; }
        else quoted = false;
      } else fieldValue += char;
      continue;
    }
    if (char === '"' && fieldValue === "") { quoted = true; continue; }
    if (char === delimiter) { row.push(fieldValue); fieldValue = ""; continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(fieldValue); fieldValue = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    fieldValue += char;
  }
  if (quoted) throw new SpreadsheetImportError("SPREADSHEET_INVALID_CSV", "El CSV contiene una comilla sin cerrar.");
  row.push(fieldValue);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function ensureHeader(table: TabularData, aliases: readonly string[], label: string): void {
  if (!aliases.some((alias) => table.headers.includes(normalizeHeader(alias)))) {
    throw new SpreadsheetImportError("SPREADSHEET_REQUIRED_HEADER", `Falta una columna requerida: ${label}.`);
  }
}

function requiredText(row: TabularRow, aliases: readonly string[], label: string): string {
  for (const alias of aliases) {
    const value = row.values[normalizeHeader(alias)];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text !== "") return text;
  }
  throw new SpreadsheetImportError(
    "SPREADSHEET_REQUIRED_VALUE",
    `Fila ${row.rowNumber}: ${label} es obligatorio.`,
    row.rowNumber,
    label,
  );
}

function boundedString(value: string, row: number, column: string): string {
  if (value.length > MAX_CELL_CHARS) {
    throw new SpreadsheetImportError(
      "SPREADSHEET_CELL_TOO_LARGE",
      `La celda ${column} de la fila ${row} supera ${MAX_CELL_CHARS} caracteres.`,
      row,
      column,
    );
  }
  return value;
}

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isBlank(value: Scalar): boolean {
  return value === null || (typeof value === "string" && value.trim() === "");
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function styleHeader(sheet: {
  getRow(index: number): { font?: unknown; fill?: unknown; alignment?: unknown };
}): void {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24413B" } };
  row.alignment = { vertical: "middle", wrapText: true };
}

function sanitizeFilePart(value: string): string {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return normalized === "" ? "candidatos" : normalized;
}
