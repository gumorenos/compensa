"use server";

import { revalidatePath } from "next/cache";
import {
  CalibrationCandidateImportService,
  type CalibrationCandidateBatchPreview,
} from "../application/calibration-candidate-import-service.js";
import {
  parseCalibrationCandidateSpreadsheet,
} from "../application/calibration-candidate-spreadsheet.js";
import {
  MAX_SPREADSHEET_BYTES,
  SpreadsheetImportError,
} from "../application/spreadsheet-import.js";
import { PersistenceError } from "../persistence/database.js";
import { getAppContext } from "./runtime.js";

const MAX_CANONICAL_BYTES = 2 * 1024 * 1024;

export interface CalibrationCandidateImportActionState {
  status: "IDLE" | "PREVIEW" | "IMPORTED" | "ERROR";
  runId: string;
  fileName: string;
  canonicalPayload: string;
  preview: CalibrationCandidateBatchPreview | null;
  message: string | null;
  importedCount: number;
  overwrittenCount: number;
}

export async function calibrationCandidateSpreadsheetAction(
  _previousState: CalibrationCandidateImportActionState,
  formData: FormData,
): Promise<CalibrationCandidateImportActionState> {
  const context = await getAppContext("MANAGE_CALIBRATION");
  const runId = requiredText(formData.get("runId"), "runId");
  const intent = formData.get("intent") === "import" ? "import" : "preview";

  try {
    let document: unknown;
    let canonicalPayload: string;
    let fileName: string;

    if (intent === "preview") {
      const file = requireSpreadsheetFile(formData.get("spreadsheetFile"));
      if (file.size > MAX_SPREADSHEET_BYTES) {
        return errorState(runId, file.name, "", `El archivo supera ${Math.floor(MAX_SPREADSHEET_BYTES / 1024 / 1024)} MiB.`);
      }
      document = await parseCalibrationCandidateSpreadsheet(
        file.name,
        new Uint8Array(await file.arrayBuffer()),
      );
      canonicalPayload = JSON.stringify(document);
      fileName = file.name;
    } else {
      const raw = formData.get("canonicalPayload");
      const rawName = formData.get("fileName");
      canonicalPayload = typeof raw === "string" ? raw : "";
      fileName = typeof rawName === "string" ? rawName : "archivo";
      if (canonicalPayload === "" || Buffer.byteLength(canonicalPayload, "utf8") > MAX_CANONICAL_BYTES) {
        return errorState(runId, fileName, "", "La previsualización ya no es válida. Vuelve a cargar y previsualizar el archivo.");
      }
      try {
        document = JSON.parse(canonicalPayload) as unknown;
      } catch {
        return errorState(runId, fileName, "", "La previsualización está dañada. Vuelve a cargar el archivo.");
      }
    }

    if (Buffer.byteLength(canonicalPayload, "utf8") > MAX_CANONICAL_BYTES) {
      return errorState(runId, fileName, "", "El archivo se expande a un lote demasiado grande después de normalizarlo.");
    }

    const service = new CalibrationCandidateImportService(context.pool);
    const preview = await service.preview(context.organization.id, runId, document);
    if (intent === "preview") {
      return {
        status: "PREVIEW",
        runId,
        fileName,
        canonicalPayload,
        preview,
        message: preview.canImport
          ? `${preview.validCases} caso${preview.validCases === 1 ? "" : "s"} listo${preview.validCases === 1 ? "" : "s"} para guardar.`
          : `El archivo contiene ${preview.invalidCases} caso${preview.invalidCases === 1 ? "" : "s"} inválido${preview.invalidCases === 1 ? "" : "s"}.`,
        importedCount: 0,
        overwrittenCount: 0,
      };
    }

    if (!preview.canImport) {
      return {
        status: "PREVIEW",
        runId,
        fileName,
        canonicalPayload,
        preview,
        message: "La importación fue bloqueada porque el dry-run repetido en servidor contiene errores.",
        importedCount: 0,
        overwrittenCount: 0,
      };
    }

    const result = await service.importBatch(
      context.organization.id,
      runId,
      document,
      context.access.user.id,
      fileName,
    );
    revalidatePath("/calibration");
    revalidatePath(`/calibration/${runId}`);
    revalidatePath(`/calibration/${runId}/import`);
    return {
      status: "IMPORTED",
      runId,
      fileName,
      canonicalPayload: "",
      preview: null,
      message: `${result.importedCount} caso${result.importedCount === 1 ? "" : "s"} guardado${result.importedCount === 1 ? "" : "s"} desde ${fileName}.${result.overwrittenCount > 0 ? ` ${result.overwrittenCount} reemplazo${result.overwrittenCount === 1 ? "" : "s"}.` : ""}`,
      importedCount: result.importedCount,
      overwrittenCount: result.overwrittenCount,
    };
  } catch (error) {
    return errorState(runId, "", "", safeError(error));
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

function requiredText(value: FormDataEntryValue | null, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} es obligatorio.`);
  return value.trim();
}

function errorState(
  runId: string,
  fileName: string,
  canonicalPayload: string,
  message: string,
): CalibrationCandidateImportActionState {
  return {
    status: "ERROR",
    runId,
    fileName,
    canonicalPayload,
    preview: null,
    message,
    importedCount: 0,
    overwrittenCount: 0,
  };
}

function safeError(error: unknown): string {
  if (error instanceof SpreadsheetImportError || error instanceof PersistenceError) return error.message;
  return "No se pudo interpretar o validar el archivo de candidatos. Revisa la plantilla y vuelve a intentarlo.";
}
