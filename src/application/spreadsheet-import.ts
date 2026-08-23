import type {
  ConstantReference,
  DimensionDefinition,
  FactorDefinition,
  GradeDefinition,
  LevelDefinition,
  LookupInputReference,
  MethodologyDefinition,
  NumericReference,
  ScoringStep,
} from "../domain/methodology.js";
import type { GoldStandardPartition } from "../domain/gold-standard.js";
import type { EvidenceSourceType } from "../persistence/database.js";
import {
  parseGoldStandardImport,
  type GoldStandardHistoricalDecision,
  type GoldStandardHistoricalEvidence,
  type GoldStandardImportDocument,
} from "./gold-standard-import.js";
import { parseMethodologyDefinition } from "./methodology-import.js";

export const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 5000;
export const MAX_SPREADSHEET_COLUMNS = 64;
const MAX_CELL_CHARS = 100_000;

export const GOLD_STANDARD_HEADERS_ES = [
  "codigo_caso",
  "etiqueta_anonima",
  "id_metodologia",
  "particion",
  "es_ancla",
  "codigo_puesto",
  "puesto",
  "departamento",
  "area",
  "familia_puesto",
  "descriptivo",
  "codigo_dimension",
  "codigo_nivel",
  "justificacion",
  "tipo_evidencia",
  "seccion_evidencia",
  "evidencia",
  "puntos_esperados",
  "grado_esperado",
  "notas",
] as const;

export const METHODOLOGY_HEADERS_ES = [
  "tipo_registro",
  "codigo",
  "nombre",
  "version",
  "codigo_padre",
  "descripcion",
  "requerido",
  "etiqueta",
  "tipo_paso",
  "referencias",
  "numerador",
  "denominador",
  "valor_redondeo",
  "precision",
  "clave_lookup",
  "valor_lookup",
  "min_puntos",
  "max_puntos",
  "paso_total",
] as const;

type Scalar = string | number | boolean | null;

interface TabularRow {
  rowNumber: number;
  values: Record<string, Scalar>;
}

interface TabularData {
  headers: string[];
  rows: TabularRow[];
}

export class SpreadsheetImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly rowNumber?: number,
    public readonly column?: string,
  ) {
    super(message);
    this.name = "SpreadsheetImportError";
  }
}

export async function parseGoldStandardSpreadsheet(
  fileName: string,
  bytes: Uint8Array,
): Promise<GoldStandardImportDocument> {
  const table = await loadTabular(fileName, bytes, "GoldStandard");
  ensureHeaders(table, [
    GOLD_ALIASES.caseCode,
    GOLD_ALIASES.anonymizedLabel,
    GOLD_ALIASES.methodologyVersionId,
    GOLD_ALIASES.jobName,
    GOLD_ALIASES.dimensionCode,
    GOLD_ALIASES.selectedLevelCode,
  ]);

  interface DecisionAccumulator {
    dimensionCode: string;
    selectedLevelCode: string;
    justification?: string | null;
    evidence: GoldStandardHistoricalEvidence[];
  }

  interface CaseAccumulator {
    caseCode: string;
    anonymizedLabel: string;
    methodologyVersionId: string;
    partition?: GoldStandardPartition;
    isAnchor?: boolean;
    jobCode?: string | null;
    jobName: string;
    department?: string | null;
    area?: string | null;
    jobFamily?: string | null;
    description?: string | null;
    expectedTotalPoints?: number;
    expectedGradeCode?: string;
    notes?: string | null;
    decisions: Map<string, DecisionAccumulator>;
  }

  const cases = new Map<string, CaseAccumulator>();
  for (const row of table.rows) {
    const caseCode = requiredText(row, GOLD_ALIASES.caseCode, "codigo_caso");
    const existing = cases.get(caseCode);
    const label = optionalText(row, GOLD_ALIASES.anonymizedLabel);
    const methodologyId = optionalText(row, GOLD_ALIASES.methodologyVersionId);
    const jobName = optionalText(row, GOLD_ALIASES.jobName);

    let item: CaseAccumulator;
    if (existing === undefined) {
      if (label === undefined) failRow(row, "SPREADSHEET_REQUIRED_VALUE", "etiqueta_anonima es obligatoria en la primera fila del caso.", "etiqueta_anonima");
      if (methodologyId === undefined) failRow(row, "SPREADSHEET_REQUIRED_VALUE", "id_metodologia es obligatorio en la primera fila del caso.", "id_metodologia");
      if (jobName === undefined) failRow(row, "SPREADSHEET_REQUIRED_VALUE", "puesto es obligatorio en la primera fila del caso.", "puesto");
      item = {
        caseCode,
        anonymizedLabel: label,
        methodologyVersionId: methodologyId,
        jobName,
        decisions: new Map(),
      };
      cases.set(caseCode, item);
    } else {
      item = existing;
      if (label !== undefined) item.anonymizedLabel = mergeRequiredText(item.anonymizedLabel, label, row, "etiqueta_anonima");
      if (methodologyId !== undefined) item.methodologyVersionId = mergeRequiredText(item.methodologyVersionId, methodologyId, row, "id_metodologia");
      if (jobName !== undefined) item.jobName = mergeRequiredText(item.jobName, jobName, row, "puesto");
    }

    item.partition = mergeOptional(item.partition, parsePartition(optionalText(row, GOLD_ALIASES.partition), row), row, "particion");
    item.isAnchor = mergeOptional(item.isAnchor, parseBooleanOptional(field(row, GOLD_ALIASES.isAnchor), row, "es_ancla"), row, "es_ancla");
    item.jobCode = mergeOptional(item.jobCode, optionalNullableText(row, GOLD_ALIASES.jobCode), row, "codigo_puesto");
    item.department = mergeOptional(item.department, optionalNullableText(row, GOLD_ALIASES.department), row, "departamento");
    item.area = mergeOptional(item.area, optionalNullableText(row, GOLD_ALIASES.area), row, "area");
    item.jobFamily = mergeOptional(item.jobFamily, optionalNullableText(row, GOLD_ALIASES.jobFamily), row, "familia_puesto");
    item.description = mergeOptional(item.description, optionalNullableText(row, GOLD_ALIASES.description), row, "descriptivo");
    item.notes = mergeOptional(item.notes, optionalNullableText(row, GOLD_ALIASES.notes), row, "notas");

    const expectedPoints = parseFiniteOptional(field(row, GOLD_ALIASES.expectedTotalPoints), row, "puntos_esperados");
    const expectedGrade = optionalText(row, GOLD_ALIASES.expectedGradeCode);
    item.expectedTotalPoints = mergeOptional(item.expectedTotalPoints, expectedPoints, row, "puntos_esperados");
    item.expectedGradeCode = mergeOptional(item.expectedGradeCode, expectedGrade, row, "grado_esperado");

    const dimensionCode = requiredText(row, GOLD_ALIASES.dimensionCode, "codigo_dimension");
    const selectedLevelCode = requiredText(row, GOLD_ALIASES.selectedLevelCode, "codigo_nivel");
    const justification = optionalNullableText(row, GOLD_ALIASES.justification);
    let decision = item.decisions.get(dimensionCode);
    if (decision === undefined) {
      decision = { dimensionCode, selectedLevelCode, justification, evidence: [] };
      item.decisions.set(dimensionCode, decision);
    } else {
      if (decision.selectedLevelCode !== selectedLevelCode) {
        failRow(row, "SPREADSHEET_CONFLICT", `La dimensión ${dimensionCode} repite niveles distintos (${decision.selectedLevelCode} y ${selectedLevelCode}).`, "codigo_nivel");
      }
      decision.justification = mergeOptional(decision.justification, justification, row, "justificacion");
    }

    const evidenceExcerpt = optionalText(row, GOLD_ALIASES.evidenceExcerpt);
    const evidenceTypeRaw = optionalText(row, GOLD_ALIASES.evidenceSourceType);
    const evidenceSection = optionalNullableText(row, GOLD_ALIASES.evidenceSection);
    if (evidenceExcerpt === undefined) {
      if (evidenceTypeRaw !== undefined || (evidenceSection !== undefined && evidenceSection !== null)) {
        failRow(row, "SPREADSHEET_EVIDENCE_INCOMPLETE", "tipo_evidencia/seccion_evidencia no pueden usarse sin evidencia.", "evidencia");
      }
    } else {
      const sourceType = parseEvidenceSource(evidenceTypeRaw, row);
      decision.evidence.push({ sourceType, sourceSection: evidenceSection, excerpt: evidenceExcerpt });
    }
  }

  if (cases.size === 0) throw new SpreadsheetImportError("SPREADSHEET_EMPTY", "El archivo no contiene filas de datos.");

  const document = {
    version: 1 as const,
    cases: [...cases.values()].map((item) => {
      if ((item.expectedTotalPoints === undefined) !== (item.expectedGradeCode === undefined)) {
        throw new SpreadsheetImportError(
          "SPREADSHEET_EXPECTED_RESULT_INCOMPLETE",
          `El caso ${item.caseCode} debe incluir juntos puntos_esperados y grado_esperado.`,
        );
      }
      const decisions: GoldStandardHistoricalDecision[] = [...item.decisions.values()].map((decision) => ({
        dimensionCode: decision.dimensionCode,
        selectedLevelCode: decision.selectedLevelCode,
        justification: decision.justification,
        ...(decision.evidence.length === 0 ? {} : { evidence: decision.evidence }),
      }));
      return {
        caseCode: item.caseCode,
        anonymizedLabel: item.anonymizedLabel,
        methodologyVersionId: item.methodologyVersionId,
        job: {
          code: item.jobCode ?? null,
          name: item.jobName,
          department: item.department ?? null,
          area: item.area ?? null,
          jobFamily: item.jobFamily ?? null,
        },
        description: item.description,
        decisions,
        expectedTotalPoints: item.expectedTotalPoints,
        expectedGradeCode: item.expectedGradeCode,
        partition: item.partition,
        isAnchor: item.isAnchor,
        expertUserId: null,
        notes: item.notes,
      };
    }),
  };

  return parseGoldStandardImport(document);
}

export async function parseMethodologySpreadsheet(
  fileName: string,
  bytes: Uint8Array,
): Promise<MethodologyDefinition> {
  const table = await loadTabular(fileName, bytes, "Methodology");
  ensureHeaders(table, [METHOD_ALIASES.recordType, METHOD_ALIASES.code]);

  const factorRows: TabularRow[] = [];
  const dimensionRows: TabularRow[] = [];
  const levelRows: TabularRow[] = [];
  const stepRows: TabularRow[] = [];
  const lookupRows: TabularRow[] = [];
  const gradeRows: TabularRow[] = [];
  let metadataRow: TabularRow | undefined;

  for (const row of table.rows) {
    const recordType = normalizeRecordType(requiredText(row, METHOD_ALIASES.recordType, "tipo_registro"));
    switch (recordType) {
      case "META":
        if (metadataRow !== undefined) failRow(row, "SPREADSHEET_DUPLICATE_META", "Solo puede existir una fila META.", "tipo_registro");
        metadataRow = row;
        break;
      case "FACTOR": factorRows.push(row); break;
      case "DIMENSION": dimensionRows.push(row); break;
      case "LEVEL": levelRows.push(row); break;
      case "STEP": stepRows.push(row); break;
      case "LOOKUP": lookupRows.push(row); break;
      case "GRADE": gradeRows.push(row); break;
    }
  }

  if (metadataRow === undefined) throw new SpreadsheetImportError("SPREADSHEET_META_MISSING", "La metodología necesita una fila META.");
  if (factorRows.length === 0) throw new SpreadsheetImportError("SPREADSHEET_FACTORS_MISSING", "La metodología necesita al menos un FACTOR.");
  if (stepRows.length === 0) throw new SpreadsheetImportError("SPREADSHEET_STEPS_MISSING", "La metodología necesita al menos un STEP.");
  if (gradeRows.length === 0) throw new SpreadsheetImportError("SPREADSHEET_GRADES_MISSING", "La metodología necesita al menos un GRADE.");

  const factorMap = new Map<string, FactorDefinition>();
  const factors: FactorDefinition[] = factorRows.map((row) => {
    const code = requiredText(row, METHOD_ALIASES.code, "codigo");
    if (factorMap.has(code)) failRow(row, "SPREADSHEET_DUPLICATE_CODE", `Factor duplicado: ${code}.`, "codigo");
    const description = optionalText(row, METHOD_ALIASES.description);
    const factor: FactorDefinition = {
      code,
      name: requiredText(row, METHOD_ALIASES.name, "nombre"),
      ...(description === undefined ? {} : { description }),
      dimensions: [],
    };
    factorMap.set(code, factor);
    return factor;
  });

  const dimensionMap = new Map<string, DimensionDefinition>();
  for (const row of dimensionRows) {
    const code = requiredText(row, METHOD_ALIASES.code, "codigo");
    if (dimensionMap.has(code)) failRow(row, "SPREADSHEET_DUPLICATE_CODE", `Dimensión duplicada: ${code}.`, "codigo");
    const parent = requiredText(row, METHOD_ALIASES.parentCode, "codigo_padre");
    const factor = factorMap.get(parent);
    if (factor === undefined) failRow(row, "SPREADSHEET_PARENT_NOT_FOUND", `La dimensión ${code} referencia un factor inexistente: ${parent}.`, "codigo_padre");
    const description = optionalText(row, METHOD_ALIASES.description);
    const dimension: DimensionDefinition = {
      code,
      name: requiredText(row, METHOD_ALIASES.name, "nombre"),
      ...(description === undefined ? {} : { description }),
      required: parseBooleanRequired(field(row, METHOD_ALIASES.required), row, "requerido"),
      levels: [],
    };
    dimensionMap.set(code, dimension);
    factor.dimensions.push(dimension);
  }

  const levelKeys = new Set<string>();
  for (const row of levelRows) {
    const code = requiredText(row, METHOD_ALIASES.code, "codigo");
    const parent = requiredText(row, METHOD_ALIASES.parentCode, "codigo_padre");
    const dimension = dimensionMap.get(parent);
    if (dimension === undefined) failRow(row, "SPREADSHEET_PARENT_NOT_FOUND", `El nivel ${code} referencia una dimensión inexistente: ${parent}.`, "codigo_padre");
    const composite = `${parent}::${code}`;
    if (levelKeys.has(composite)) failRow(row, "SPREADSHEET_DUPLICATE_CODE", `Nivel duplicado ${code} en ${parent}.`, "codigo");
    levelKeys.add(composite);
    const description = optionalText(row, METHOD_ALIASES.description);
    const level: LevelDefinition = {
      code,
      label: requiredText(row, METHOD_ALIASES.label, "etiqueta"),
      ...(description === undefined ? {} : { description }),
    };
    dimension.levels.push(level);
  }

  const stepMap = new Map<string, ScoringStep>();
  const steps: ScoringStep[] = stepRows.map((row) => {
    const code = requiredText(row, METHOD_ALIASES.code, "codigo");
    if (stepMap.has(code)) failRow(row, "SPREADSHEET_DUPLICATE_CODE", `Paso duplicado: ${code}.`, "codigo");
    const label = optionalText(row, METHOD_ALIASES.label) ?? optionalText(row, METHOD_ALIASES.name);
    const type = requiredText(row, METHOD_ALIASES.stepType, "tipo_paso").toLowerCase();
    const base = label === undefined ? { code } : { code, label };
    let step: ScoringStep;
    switch (type) {
      case "lookup":
        step = { ...base, type, inputs: parseReferenceList(optionalText(row, METHOD_ALIASES.references), row, true) as LookupInputReference[], table: {} };
        break;
      case "sum":
      case "multiply":
        step = { ...base, type, operands: parseReferenceList(optionalText(row, METHOD_ALIASES.references), row, false) as NumericReference[] };
        break;
      case "divide":
        step = {
          ...base,
          type,
          numerator: parseNumericReferenceToken(requiredText(row, METHOD_ALIASES.numerator, "numerador"), row, "numerador"),
          denominator: parseNumericReferenceToken(requiredText(row, METHOD_ALIASES.denominator, "denominador"), row, "denominador"),
        };
        break;
      case "round": {
        const precision = parseFiniteRequired(field(row, METHOD_ALIASES.precision), row, "precision");
        step = {
          ...base,
          type,
          value: parseNumericReferenceToken(requiredText(row, METHOD_ALIASES.roundValue, "valor_redondeo"), row, "valor_redondeo"),
          precision,
        };
        break;
      }
      default:
        failRow(row, "SPREADSHEET_INVALID_STEP_TYPE", `tipo_paso debe ser lookup, sum, multiply, divide o round; recibido ${type}.`, "tipo_paso");
    }
    stepMap.set(code, step);
    return step;
  });

  for (const row of lookupRows) {
    const parent = requiredText(row, METHOD_ALIASES.parentCode, "codigo_padre");
    const step = stepMap.get(parent);
    if (step === undefined) failRow(row, "SPREADSHEET_PARENT_NOT_FOUND", `LOOKUP referencia un STEP inexistente: ${parent}.`, "codigo_padre");
    if (step.type !== "lookup") failRow(row, "SPREADSHEET_LOOKUP_PARENT_INVALID", `El STEP ${parent} no es de tipo lookup.`, "codigo_padre");
    const key = requiredText(row, METHOD_ALIASES.lookupKey, "clave_lookup");
    if (Object.hasOwn(step.table, key)) failRow(row, "SPREADSHEET_DUPLICATE_LOOKUP_KEY", `Clave lookup duplicada ${key} en ${parent}.`, "clave_lookup");
    step.table[key] = parseFiniteRequired(field(row, METHOD_ALIASES.lookupValue), row, "valor_lookup");
  }

  const grades: GradeDefinition[] = gradeRows.map((row) => ({
    code: requiredText(row, METHOD_ALIASES.code, "codigo"),
    name: requiredText(row, METHOD_ALIASES.name, "nombre"),
    minPoints: parseFiniteRequired(field(row, METHOD_ALIASES.minPoints), row, "min_puntos"),
    maxPoints: parseFiniteRequired(field(row, METHOD_ALIASES.maxPoints), row, "max_puntos"),
  }));

  const definition: MethodologyDefinition = {
    code: requiredText(metadataRow, METHOD_ALIASES.code, "codigo"),
    name: requiredText(metadataRow, METHOD_ALIASES.name, "nombre"),
    version: requiredText(metadataRow, METHOD_ALIASES.version, "version"),
    factors,
    scoring: {
      steps,
      totalStep: requiredText(metadataRow, METHOD_ALIASES.totalStep, "paso_total"),
    },
    grades,
  };

  return parseMethodologyDefinition(definition);
}

async function loadTabular(fileName: string, bytes: Uint8Array, preferredSheet: string): Promise<TabularData> {
  if (bytes.byteLength === 0) throw new SpreadsheetImportError("SPREADSHEET_EMPTY_FILE", "El archivo está vacío.");
  if (bytes.byteLength > MAX_SPREADSHEET_BYTES) {
    throw new SpreadsheetImportError("SPREADSHEET_TOO_LARGE", `El archivo supera ${Math.floor(MAX_SPREADSHEET_BYTES / 1024 / 1024)} MiB.`);
  }
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "csv") return matrixToTable(parseCsv(new TextDecoder("utf-8", { fatal: false }).decode(bytes)));
  if (extension !== "xlsx") throw new SpreadsheetImportError("SPREADSHEET_UNSUPPORTED_TYPE", "Solo se admiten archivos .xlsx o .csv.");
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
  type Workbook = {
    worksheets: Worksheet[];
    xlsx: { load(data: Buffer): Promise<unknown> };
  };
  type WorkbookConstructor = new () => Workbook;
  type ModuleShape = { Workbook?: WorkbookConstructor; default?: { Workbook?: WorkbookConstructor } };

  const module = (await import("@excel.js/exceljs")) as unknown as ModuleShape;
  const WorkbookCtor = module.Workbook ?? module.default?.Workbook;
  if (WorkbookCtor === undefined) throw new SpreadsheetImportError("SPREADSHEET_ENGINE_UNAVAILABLE", "No se pudo inicializar el lector XLSX.");
  const workbook = new WorkbookCtor();
  try {
    await workbook.xlsx.load(Buffer.from(bytes));
  } catch {
    throw new SpreadsheetImportError("SPREADSHEET_INVALID_XLSX", "El archivo XLSX está dañado o no puede interpretarse.");
  }
  if (workbook.worksheets.length === 0) throw new SpreadsheetImportError("SPREADSHEET_NO_SHEETS", "El XLSX no contiene hojas.");
  const worksheet = workbook.worksheets.find((sheet) => sheet.name.toLowerCase() === preferredSheet.toLowerCase())
    ?? (workbook.worksheets.length === 1 ? workbook.worksheets[0] : undefined);
  if (worksheet === undefined) {
    throw new SpreadsheetImportError("SPREADSHEET_SHEET_NOT_FOUND", `El XLSX debe incluir una hoja llamada ${preferredSheet}.`);
  }
  const rowCount = Math.max(worksheet.actualRowCount ?? 0, worksheet.rowCount);
  const columnCount = Math.max(worksheet.actualColumnCount ?? 0, worksheet.columnCount);
  if (rowCount > MAX_SPREADSHEET_ROWS + 1) throw new SpreadsheetImportError("SPREADSHEET_TOO_MANY_ROWS", `La hoja supera ${MAX_SPREADSHEET_ROWS} filas de datos.`);
  if (columnCount > MAX_SPREADSHEET_COLUMNS) throw new SpreadsheetImportError("SPREADSHEET_TOO_MANY_COLUMNS", `La hoja supera ${MAX_SPREADSHEET_COLUMNS} columnas.`);
  const matrix: Scalar[][] = [];
  for (let rowIndex = 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const values: Scalar[] = [];
    let nonEmpty = false;
    for (let columnIndex = 1; columnIndex <= worksheet.columnCount; columnIndex += 1) {
      const value = excelCellValue(row.getCell(columnIndex).value, rowIndex, columnIndex);
      if (value !== null && String(value).trim() !== "") nonEmpty = true;
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
      throw new SpreadsheetImportError("SPREADSHEET_FORMULA_NOT_ALLOWED", `No se permiten fórmulas en celdas de importación (fila ${row}, columna ${column}).`, row, String(column));
    }
    if (Array.isArray(object.richText)) {
      const joined = object.richText.map((part) => typeof part === "object" && part !== null && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "").join("");
      return boundedString(joined, row, String(column));
    }
    if (typeof object.text === "string") return boundedString(object.text, row, String(column));
  }
  throw new SpreadsheetImportError("SPREADSHEET_UNSUPPORTED_CELL", `Tipo de celda no soportado en fila ${row}, columna ${column}.`, row, String(column));
}

function matrixToTable(matrix: Scalar[][]): TabularData {
  if (matrix.length === 0) throw new SpreadsheetImportError("SPREADSHEET_EMPTY", "El archivo no contiene filas.");
  const rawHeaders = matrix[0] ?? [];
  const headers = rawHeaders.map((value, index) => {
    const textValue = value === null ? "" : String(value).trim();
    if (textValue === "") throw new SpreadsheetImportError("SPREADSHEET_EMPTY_HEADER", `La columna ${index + 1} no tiene encabezado.`);
    return normalizeHeader(textValue);
  });
  if (headers.length > MAX_SPREADSHEET_COLUMNS) throw new SpreadsheetImportError("SPREADSHEET_TOO_MANY_COLUMNS", `El archivo supera ${MAX_SPREADSHEET_COLUMNS} columnas.`);
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) throw new SpreadsheetImportError("SPREADSHEET_DUPLICATE_HEADER", `Encabezado duplicado: ${header}.`);
    seen.add(header);
  }
  const rows: TabularRow[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    if (rows.length >= MAX_SPREADSHEET_ROWS) throw new SpreadsheetImportError("SPREADSHEET_TOO_MANY_ROWS", `El archivo supera ${MAX_SPREADSHEET_ROWS} filas de datos.`);
    const raw = matrix[index] ?? [];
    const values: Record<string, Scalar> = {};
    let nonEmpty = false;
    for (let column = 0; column < headers.length; column += 1) {
      const value = raw[column] ?? null;
      if (value !== null && String(value).trim() !== "") nonEmpty = true;
      values[headers[column]!] = typeof value === "string" ? boundedString(value, index + 1, headers[column]!) : value;
    }
    if (nonEmpty) rows.push({ rowNumber: index + 1, values });
  }
  return { headers, rows };
}

function parseCsv(input: string): Scalar[][] {
  const text = input.replace(/^\uFEFF/, "");
  const candidates = [",", ";", "\t"];
  const parsed = candidates.map((delimiter) => ({ delimiter, matrix: parseDelimited(text, delimiter) }));
  parsed.sort((left, right) => (right.matrix[0]?.length ?? 0) - (left.matrix[0]?.length ?? 0));
  const best = parsed[0];
  if (best === undefined || (best.matrix[0]?.length ?? 0) < 2) {
    throw new SpreadsheetImportError("SPREADSHEET_CSV_DELIMITER", "No se pudo detectar un CSV con columnas separadas por coma, punto y coma o tabulación.");
  }
  return best.matrix;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let fieldValue = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
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

function ensureHeaders(table: TabularData, aliasGroups: readonly (readonly string[])[]): void {
  for (const aliases of aliasGroups) {
    if (!aliases.some((alias) => table.headers.includes(normalizeHeader(alias)))) {
      throw new SpreadsheetImportError("SPREADSHEET_REQUIRED_HEADER", `Falta una columna requerida: ${aliases[0]}.`);
    }
  }
}

function field(row: TabularRow, aliases: readonly string[]): Scalar | undefined {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (Object.hasOwn(row.values, key)) return row.values[key];
  }
  return undefined;
}

function requiredText(row: TabularRow, aliases: readonly string[], label: string): string {
  const value = optionalText(row, aliases);
  if (value === undefined) failRow(row, "SPREADSHEET_REQUIRED_VALUE", `${label} es obligatorio.`, label);
  return value;
}

function optionalText(row: TabularRow, aliases: readonly string[]): string | undefined {
  const value = field(row, aliases);
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result === "" ? undefined : result;
}

function optionalNullableText(row: TabularRow, aliases: readonly string[]): string | null | undefined {
  const value = field(row, aliases);
  if (value === undefined) return undefined;
  if (value === null) return null;
  const result = String(value).trim();
  return result === "" ? undefined : result;
}

function mergeRequiredText(current: string, incoming: string, row: TabularRow, label: string): string {
  if (current !== incoming) failRow(row, "SPREADSHEET_CONFLICT", `${label} cambia dentro del mismo caso (${current} vs ${incoming}).`, label);
  return current;
}

function mergeOptional<T>(current: T | undefined, incoming: T | undefined, row: TabularRow, label: string): T | undefined {
  if (incoming === undefined) return current;
  if (current === undefined) return incoming;
  if (!sameValue(current, incoming)) failRow(row, "SPREADSHEET_CONFLICT", `${label} cambia dentro del mismo caso.`, label);
  return current;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseBooleanOptional(value: Scalar | undefined, row: TabularRow, label: string): boolean | undefined {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  return parseBooleanRequired(value, row, label);
}

function parseBooleanRequired(value: Scalar | undefined, row: TabularRow, label: string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  const normalized = value === undefined || value === null ? "" : stripAccents(String(value).trim().toLowerCase());
  if (["true", "1", "si", "yes", "y", "x"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  failRow(row, "SPREADSHEET_INVALID_BOOLEAN", `${label} debe ser Sí/No o true/false.`, label);
}

function parseFiniteOptional(value: Scalar | undefined, row: TabularRow, label: string): number | undefined {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  return parseFiniteRequired(value, row, label);
}

function parseFiniteRequired(value: Scalar | undefined, row: TabularRow, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = value === undefined || value === null ? "" : String(value).trim();
  const normalized = /^-?\d+,\d+$/.test(text) ? text.replace(",", ".") : text;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) failRow(row, "SPREADSHEET_INVALID_NUMBER", `${label} debe ser numérico.`, label);
  return parsed;
}

function parsePartition(value: string | undefined, row: TabularRow): GoldStandardPartition | undefined {
  if (value === undefined) return undefined;
  const normalized = stripAccents(value.trim().toUpperCase());
  if (normalized === "UNASSIGNED" || normalized === "SIN_ASIGNAR") return "UNASSIGNED";
  if (normalized === "CALIBRATION" || normalized === "CALIBRACION") return "CALIBRATION";
  if (normalized === "HOLDOUT" || normalized === "PRUEBA") return "HOLDOUT";
  failRow(row, "SPREADSHEET_INVALID_PARTITION", "particion debe ser UNASSIGNED, CALIBRATION o HOLDOUT.", "particion");
}

function parseEvidenceSource(value: string | undefined, row: TabularRow): EvidenceSourceType {
  if (value === undefined) failRow(row, "SPREADSHEET_EVIDENCE_INCOMPLETE", "tipo_evidencia es obligatorio cuando existe evidencia.", "tipo_evidencia");
  const normalized = stripAccents(value.trim().toUpperCase());
  if (["JOB_DESCRIPTION", "DESCRIPTIVO", "DESCRIPCION_PUESTO"].includes(normalized)) return "JOB_DESCRIPTION";
  if (["INTERVIEW", "ENTREVISTA"].includes(normalized)) return "INTERVIEW";
  if (["OTHER", "OTRO"].includes(normalized)) return "OTHER";
  failRow(row, "SPREADSHEET_INVALID_EVIDENCE_TYPE", "tipo_evidencia debe ser JOB_DESCRIPTION, INTERVIEW u OTHER.", "tipo_evidencia");
}

function normalizeRecordType(value: string): "META" | "FACTOR" | "DIMENSION" | "LEVEL" | "STEP" | "LOOKUP" | "GRADE" {
  const normalized = stripAccents(value.trim().toUpperCase());
  if (["META", "METADATA", "METODOLOGIA", "METHODOLOGY"].includes(normalized)) return "META";
  if (normalized === "FACTOR") return "FACTOR";
  if (normalized === "DIMENSION") return "DIMENSION";
  if (["LEVEL", "NIVEL"].includes(normalized)) return "LEVEL";
  if (["STEP", "PASO"].includes(normalized)) return "STEP";
  if (normalized === "LOOKUP") return "LOOKUP";
  if (["GRADE", "GRADO"].includes(normalized)) return "GRADE";
  throw new SpreadsheetImportError("SPREADSHEET_INVALID_RECORD_TYPE", `tipo_registro no reconocido: ${value}.`);
}

function parseReferenceList(value: string | undefined, row: TabularRow, lookup: boolean): Array<LookupInputReference | NumericReference> {
  if (value === undefined) return [];
  return value.split("|").map((token) => token.trim()).filter(Boolean).map((token) =>
    lookup ? parseLookupReferenceToken(token, row, "referencias") : parseNumericReferenceToken(token, row, "referencias"),
  );
}

function parseLookupReferenceToken(token: string, row: TabularRow, label: string): LookupInputReference {
  const separator = token.indexOf(":");
  const kind = separator < 0 ? "" : token.slice(0, separator).trim().toLowerCase();
  const value = separator < 0 ? "" : token.slice(separator + 1).trim();
  if (kind === "selection" && value !== "") return { kind, dimension: value };
  if (kind === "step" && value !== "") return { kind, step: value };
  failRow(row, "SPREADSHEET_INVALID_REFERENCE", `${label}: usa selection:CODIGO o step:CODIGO.`, label);
}

function parseNumericReferenceToken(token: string, row: TabularRow, label: string): NumericReference {
  const separator = token.indexOf(":");
  const kind = separator < 0 ? "" : token.slice(0, separator).trim().toLowerCase();
  const value = separator < 0 ? "" : token.slice(separator + 1).trim();
  if (kind === "step" && value !== "") return { kind, step: value };
  if (kind === "constant" && value !== "") {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed)) failRow(row, "SPREADSHEET_INVALID_REFERENCE", `${label}: constante inválida ${value}.`, label);
    const reference: ConstantReference = { kind, value: parsed };
    return reference;
  }
  failRow(row, "SPREADSHEET_INVALID_REFERENCE", `${label}: usa step:CODIGO o constant:NUMERO.`, label);
}

function boundedString(value: string, row: number, column: string): string {
  if (value.length > MAX_CELL_CHARS) throw new SpreadsheetImportError("SPREADSHEET_CELL_TOO_LARGE", `La celda ${column} de la fila ${row} supera ${MAX_CELL_CHARS} caracteres.`, row, column);
  return value;
}

function normalizeHeader(value: string): string {
  return stripAccents(value.trim().toLowerCase()).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function failRow(row: TabularRow, code: string, message: string, column?: string): never {
  throw new SpreadsheetImportError(code, `Fila ${row.rowNumber}: ${message}`, row.rowNumber, column);
}

const GOLD_ALIASES = {
  caseCode: ["codigo_caso", "case_code", "casecode"],
  anonymizedLabel: ["etiqueta_anonima", "anonymized_label", "referencia"],
  methodologyVersionId: ["id_metodologia", "methodology_version_id", "methodologyversionid"],
  partition: ["particion", "partition"],
  isAnchor: ["es_ancla", "is_anchor", "anchor"],
  jobCode: ["codigo_puesto", "job_code"],
  jobName: ["puesto", "job_name", "nombre_puesto"],
  department: ["departamento", "department"],
  area: ["area"],
  jobFamily: ["familia_puesto", "job_family"],
  description: ["descriptivo", "description", "job_description"],
  dimensionCode: ["codigo_dimension", "dimension_code"],
  selectedLevelCode: ["codigo_nivel", "selected_level_code", "level_code"],
  justification: ["justificacion", "justification"],
  evidenceSourceType: ["tipo_evidencia", "evidence_source_type"],
  evidenceSection: ["seccion_evidencia", "evidence_section"],
  evidenceExcerpt: ["evidencia", "evidence_excerpt"],
  expectedTotalPoints: ["puntos_esperados", "expected_total_points"],
  expectedGradeCode: ["grado_esperado", "expected_grade_code"],
  notes: ["notas", "notes"],
} as const;

const METHOD_ALIASES = {
  recordType: ["tipo_registro", "record_type"],
  code: ["codigo", "code"],
  name: ["nombre", "name"],
  version: ["version"],
  parentCode: ["codigo_padre", "parent_code"],
  description: ["descripcion", "description"],
  required: ["requerido", "required"],
  label: ["etiqueta", "label"],
  stepType: ["tipo_paso", "step_type"],
  references: ["referencias", "references"],
  numerator: ["numerador", "numerator"],
  denominator: ["denominador", "denominator"],
  roundValue: ["valor_redondeo", "round_value"],
  precision: ["precision"],
  lookupKey: ["clave_lookup", "lookup_key"],
  lookupValue: ["valor_lookup", "lookup_value"],
  minPoints: ["min_puntos", "min_points"],
  maxPoints: ["max_puntos", "max_points"],
  totalStep: ["paso_total", "total_step"],
} as const;
