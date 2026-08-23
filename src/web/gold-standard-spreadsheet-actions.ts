"use server";

import { revalidatePath } from "next/cache";
import {
  GoldStandardImportPreviewService,
  type GoldStandardImportPreview,
} from "../application/gold-standard-import-preview.js";
import { GoldStandardService } from "../application/gold-standard-service.js";
import {
  MAX_SPREADSHEET_BYTES,
  SpreadsheetImportError,
  parseGoldStandardSpreadsheet,
} from "../application/spreadsheet-import.js";
import { PersistenceError } from "../persistence/database.js";
import { appendSecurityAuditEvent, getAppContext } from "./runtime.js";

const MAX_CANONICAL_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_CASES = 100;

export interface GoldStandardSpreadsheetActionState {
  status: "IDLE" | "PREVIEW" | "IMPORTED" | "ERROR";
  fileName: string;
  canonicalPayload: string;
  preview: GoldStandardImportPreview | null;
  message: string | null;
  importedCount: number;
}

export async function goldStandardSpreadsheetAction(
  _previousState: GoldStandardSpreadsheetActionState,
  formData: FormData,
): Promise<GoldStandardSpreadsheetActionState> {
  const context = await getAppContext("MANAGE_GOLD_STANDARD");
  const intent = formData.get("intent") === "import" ? "import" : "preview";

  try {
    let document: unknown;
    let canonicalPayload: string;
    let fileName: string;

    if (intent === "preview") {
      const file = requireSpreadsheetFile(formData.get("spreadsheetFile"));
      if (file.size > MAX_SPREADSHEET_BYTES) {
        return errorState(file.name, "", `El archivo supera ${Math.floor(MAX_SPREADSHEET_BYTES / 1024 / 1024)} MiB.`);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      document = await parseGoldStandardSpreadsheet(file.name, bytes);
      canonicalPayload = JSON.stringify(document);
      fileName = file.name;
    } else {
      const raw = formData.get("canonicalPayload");
      const rawName = formData.get("fileName");
      canonicalPayload = typeof raw === "string" ? raw : "";
      fileName = typeof rawName === "string" ? rawName : "archivo";
      if (canonicalPayload === "" || Buffer.byteLength(canonicalPayload, "utf8") > MAX_CANONICAL_BYTES) {
        return errorState(fileName, "", "La previsualización de archivo ya no es válida. Vuelve a cargar y previsualizar el archivo.");
      }
      try {
        document = JSON.parse(canonicalPayload) as unknown;
      } catch {
        return errorState(fileName, "", "La previsualización de archivo está dañada. Vuelve a cargar el archivo.");
      }
    }

    if (isRecord(document) && Array.isArray(document.cases) && document.cases.length > MAX_IMPORT_CASES) {
      return errorState(fileName, canonicalPayload, `El lote supera el máximo de ${MAX_IMPORT_CASES} casos por operación.`);
    }
    if (Buffer.byteLength(canonicalPayload, "utf8") > MAX_CANONICAL_BYTES) {
      return errorState(fileName, "", "El archivo se expande a un lote demasiado grande después de normalizarlo.");
    }

    const previewService = new GoldStandardImportPreviewService(context.pool);
    const preview = await previewService.preview(context.organization.id, document);
    if (intent === "preview") {
      return {
        status: "PREVIEW",
        fileName,
        canonicalPayload,
        preview,
        message: preview.canImport
          ? `${preview.validCases} caso${preview.validCases === 1 ? "" : "s"} listo${preview.validCases === 1 ? "" : "s"} para importar desde ${fileName}.`
          : `El archivo contiene ${preview.invalidCases} caso${preview.invalidCases === 1 ? "" : "s"} inválido${preview.invalidCases === 1 ? "" : "s"}.`,
        importedCount: 0,
      };
    }

    if (!preview.canImport) {
      return {
        status: "PREVIEW",
        fileName,
        canonicalPayload,
        preview,
        message: "La importación fue bloqueada porque el dry-run repetido en servidor contiene errores.",
        importedCount: 0,
      };
    }

    const result = await new GoldStandardService(context.pool).importHistoricalCases(
      context.organization.id,
      document,
      context.access.user.id,
    );
    let auditRecorded = true;
    try {
      await appendSecurityAuditEvent(
        context,
        "GOLD_STANDARD_SPREADSHEET_IMPORT",
        "GOLD_STANDARD_BATCH",
        null,
        {
          fileName,
          count: result.imported.length,
          caseCodes: result.imported.map((item) => item.case.caseCode),
        },
      );
    } catch (error) {
      auditRecorded = false;
      console.error("Gold Standard spreadsheet import succeeded but audit failed.", error);
    }

    revalidatePath("/gold-standard");
    revalidatePath("/gold-standard/import");
    const base = `${result.imported.length} referencia${result.imported.length === 1 ? "" : "s"} importada${result.imported.length === 1 ? "" : "s"} desde ${fileName}.`;
    return {
      status: "IMPORTED",
      fileName,
      canonicalPayload: "",
      preview: null,
      message: auditRecorded ? base : `${base} El evento de auditoría falló; revisa los logs del servidor.`,
      importedCount: result.imported.length,
    };
  } catch (error) {
    return errorState("", "", safeError(error));
  }
}

function requireSpreadsheetFile(value: FormDataEntryValue | null): File {
  if (value === null || typeof value === "string" || typeof value.arrayBuffer !== "function") {
    throw new SpreadsheetImportError("SPREADSHEET_FILE_REQUIRED", "Selecciona un archivo .xlsx o .csv.");
  }
  const name = typeof value.name === "string" ? value.name : "";
  if (!/\.(xlsx|csv)$/i.test(name)) {
    throw new SpreadsheetImportError("SPREADSHEET_UNSUPPORTED_TYPE", "Selecciona un archivo con extensión .xlsx o .csv.");
  }
  return value;
}

function errorState(fileName: string, canonicalPayload: string, message: string): GoldStandardSpreadsheetActionState {
  return { status: "ERROR", fileName, canonicalPayload, preview: null, message, importedCount: 0 };
}

function safeError(error: unknown): string {
  if (error instanceof SpreadsheetImportError || error instanceof PersistenceError) return error.message;
  return "No se pudo interpretar o validar el archivo. Revisa la plantilla y vuelve a intentarlo.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
