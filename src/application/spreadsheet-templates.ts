import {
  GOLD_STANDARD_HEADERS_ES,
  METHODOLOGY_HEADERS_ES,
} from "./spreadsheet-import.js";

export type SpreadsheetTemplateKind = "gold-standard" | "methodology";
export type SpreadsheetTemplateFormat = "csv" | "xlsx";

export interface SpreadsheetTemplate {
  fileName: string;
  contentType: string;
  body: string | Uint8Array;
}

export async function buildSpreadsheetTemplate(
  kind: SpreadsheetTemplateKind,
  format: SpreadsheetTemplateFormat,
): Promise<SpreadsheetTemplate> {
  if (format === "csv") {
    const headers = kind === "gold-standard" ? GOLD_STANDARD_HEADERS_ES : METHODOLOGY_HEADERS_ES;
    return {
      fileName: kind === "gold-standard" ? "compensa-gold-standard.csv" : "compensa-metodologia.csv",
      contentType: "text/csv; charset=utf-8",
      body: `\uFEFF${headers.map(csvCell).join(",")}\r\n`,
    };
  }
  return buildXlsxTemplate(kind);
}

async function buildXlsxTemplate(kind: SpreadsheetTemplateKind): Promise<SpreadsheetTemplate> {
  type Worksheet = {
    addRow(values: unknown[]): { font?: unknown };
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

  const module = (await import("@excel.js/exceljs")) as unknown as ModuleShape;
  const WorkbookCtor = module.Workbook ?? module.default?.Workbook;
  if (WorkbookCtor === undefined) throw new Error("Spreadsheet engine is unavailable.");
  const workbook = new WorkbookCtor();
  const instructions = workbook.addWorksheet("Instrucciones");
  const targetName = kind === "gold-standard" ? "GoldStandard" : "Methodology";
  const target = workbook.addWorksheet(targetName);
  const example = workbook.addWorksheet("Ejemplo");

  const headers = kind === "gold-standard" ? [...GOLD_STANDARD_HEADERS_ES] : [...METHODOLOGY_HEADERS_ES];
  target.addRow(headers);
  example.addRow(headers);
  styleHeader(target);
  styleHeader(example);
  target.columns = headers.map((header) => ({ width: suggestedWidth(header) }));
  example.columns = headers.map((header) => ({ width: suggestedWidth(header) }));
  target.views = [{ state: "frozen", ySplit: 1 }];
  example.views = [{ state: "frozen", ySplit: 1 }];

  instructions.addRow(["Compensa · plantilla de importación"]);
  instructions.addRow(["Usa la hoja", targetName, "para tus datos. La hoja Ejemplo no se importa."]);
  instructions.addRow(["Formatos aceptados", ".xlsx y .csv"]);
  instructions.addRow(["Límites", "5 MiB, 5,000 filas, 64 columnas, máximo 100 casos por lote Gold Standard."]);
  instructions.addRow(["Seguridad", "No se permiten fórmulas en celdas de importación. Usa solo valores."]);
  instructions.addRow([]);

  if (kind === "gold-standard") {
    instructions.addRow(["Gold Standard"]);
    instructions.addRow(["Una fila representa una decisión y, opcionalmente, una evidencia. Repite codigo_caso para agrupar filas del mismo puesto."]);
    instructions.addRow(["Campos mínimos en la primera fila de cada caso", "codigo_caso, etiqueta_anonima, id_metodologia, puesto, codigo_dimension, codigo_nivel"]);
    instructions.addRow(["Filas adicionales del mismo caso", "Pueden dejar vacíos los metadatos del puesto; codigo_caso, codigo_dimension y codigo_nivel siguen siendo obligatorios."]);
    instructions.addRow(["Evidencia", "Si usas evidencia, indica tipo_evidencia: JOB_DESCRIPTION, INTERVIEW u OTHER."]);
    instructions.addRow(["Privacidad", "No incluyas nombres de trabajadores, DNI, desempeño ni remuneraciones innecesarias."]);
    addRows(example, goldExampleRows());
  } else {
    instructions.addRow(["Metodología"]);
    instructions.addRow(["Cada fila usa tipo_registro", "META, FACTOR, DIMENSION, LEVEL, STEP, LOOKUP o GRADE."]);
    instructions.addRow(["META", "Una sola fila. Completa codigo, nombre, version y paso_total."]);
    instructions.addRow(["DIMENSION / LEVEL / LOOKUP", "Usan codigo_padre para referenciar FACTOR, DIMENSION o STEP respectivamente."]);
    instructions.addRow(["Referencias STEP", "Separa múltiples referencias con |. Ej.: selection:KNOWLEDGE|step:OTHER. Para constantes: constant:100."]);
    instructions.addRow(["Tipos STEP", "lookup, sum, multiply, divide, round. No se ejecuta código ni fórmulas arbitrarias."]);
    instructions.addRow(["Propiedad intelectual", "Carga únicamente contenido propio o autorizado/licenciado por tu organización."]);
    addRows(example, methodologyExampleRows());
  }

  instructions.columns = [{ width: 34 }, { width: 90 }, { width: 28 }];
  instructions.getRow(1).font = { bold: true, size: 16 };
  const buffer = await workbook.xlsx.writeBuffer();
  const body = buffer instanceof Uint8Array
    ? new Uint8Array(buffer)
    : buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    fileName: kind === "gold-standard" ? "compensa-gold-standard.xlsx" : "compensa-metodologia.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body,
  };
}

function styleHeader(sheet: {
  getRow(index: number): { font?: unknown; fill?: unknown; alignment?: unknown };
}): void {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24413B" } };
  row.alignment = { vertical: "middle", wrapText: true };
}

function addRows(sheet: { addRow(values: unknown[]): unknown }, rows: unknown[][]): void {
  for (const row of rows) sheet.addRow(row);
}

function goldExampleRows(): unknown[][] {
  return [
    ["GS-EJ-001", "Jefatura ejemplo", "PEGAR_ID_METODOLOGIA", "CALIBRATION", "Sí", "JEF-001", "Jefatura de ejemplo", "Operaciones", "", "Operaciones", "Descriptivo anonimizado de ejemplo.", "DIM_A", "A2", "Alcance compatible con A2.", "JOB_DESCRIPTION", "Responsabilidades", "Coordina el proceso de punta a punta.", "", "", "Ejemplo: copiar a GoldStandard solo después de reemplazar códigos."],
    ["GS-EJ-001", "", "", "", "", "", "", "", "", "", "", "DIM_B", "B1", "Decisión experta de ejemplo.", "", "", "", "", "", ""],
  ];
}

function methodologyExampleRows(): unknown[][] {
  return [
    ["META", "SIMPLE_DEMO", "Metodología tabular de ejemplo", "1.0", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "TOTAL"],
    ["FACTOR", "KNOWLEDGE", "Conocimiento", "", "", "Factor ficticio de ejemplo", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["DIMENSION", "K", "Conocimiento requerido", "", "KNOWLEDGE", "", "Sí", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["LEVEL", "K1", "", "", "K", "", "", "Básico", "", "", "", "", "", "", "", "", "", "", ""],
    ["LEVEL", "K2", "", "", "K", "", "", "Avanzado", "", "", "", "", "", "", "", "", "", "", ""],
    ["STEP", "SCORE", "", "", "", "", "", "Puntos", "lookup", "selection:K", "", "", "", "", "", "", "", "", ""],
    ["LOOKUP", "", "", "", "SCORE", "", "", "", "", "", "", "", "", "", "K1", 100, "", "", ""],
    ["LOOKUP", "", "", "", "SCORE", "", "", "", "", "", "", "", "", "", "K2", 200, "", "", ""],
    ["STEP", "TOTAL", "", "", "", "", "", "Total", "round", "", "", "", "step:SCORE", 0, "", "", "", "", ""],
    ["GRADE", "G1", "Grado 1", "", "", "", "", "", "", "", "", "", "", "", "", "", 0, 150, ""],
    ["GRADE", "G2", "Grado 2", "", "", "", "", "", "", "", "", "", "", "", "", "", 151, 300, ""],
  ];
}

function suggestedWidth(header: string): number {
  if (["descriptivo", "justificacion", "evidencia", "descripcion", "referencias"].includes(header)) return 34;
  if (["id_metodologia", "etiqueta_anonima", "seccion_evidencia", "codigo_dimension"].includes(header)) return 24;
  return Math.max(14, Math.min(22, header.length + 3));
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
