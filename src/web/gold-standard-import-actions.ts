"use server";

import { revalidatePath } from "next/cache";
import { GoldStandardImportPreviewService, type GoldStandardImportPreview } from "../application/gold-standard-import-preview.js";
import { GoldStandardService } from "../application/gold-standard-service.js";
import { PersistenceError } from "../persistence/database.js";
import { appendSecurityAuditEvent, getAppContext } from "./runtime.js";

const MAX_IMPORT_BYTES = 512 * 1024;
const MAX_IMPORT_CASES = 100;

export interface GoldStandardImportActionState {
  status: "IDLE" | "PREVIEW" | "IMPORTED" | "ERROR";
  payload: string;
  preview: GoldStandardImportPreview | null;
  message: string | null;
  importedCount: number;
}

export const initialGoldStandardImportActionState: GoldStandardImportActionState = {
  status: "IDLE",
  payload: "",
  preview: null,
  message: null,
  importedCount: 0,
};

export async function goldStandardImportAction(
  _previousState: GoldStandardImportActionState,
  formData: FormData,
): Promise<GoldStandardImportActionState> {
  const context = await getAppContext("MANAGE_GOLD_STANDARD");
  const payloadValue = formData.get("payload");
  const intentValue = formData.get("intent");
  const payload = typeof payloadValue === "string" ? payloadValue.trim() : "";
  const intent = intentValue === "import" ? "import" : "preview";

  if (payload === "") {
    return errorState(payload, "Pega un documento JSON antes de previsualizar.");
  }
  if (Buffer.byteLength(payload, "utf8") > MAX_IMPORT_BYTES) {
    return errorState(payload, "El JSON supera el límite de 512 KiB de esta primera versión.");
  }

  let document: unknown;
  try {
    document = JSON.parse(payload) as unknown;
  } catch {
    return errorState(payload, "El contenido no es JSON válido.");
  }

  if (isRecord(document) && Array.isArray(document.cases) && document.cases.length > MAX_IMPORT_CASES) {
    return errorState(payload, `El lote supera el máximo de ${MAX_IMPORT_CASES} casos por operación.`);
  }

  try {
    const previewService = new GoldStandardImportPreviewService(context.pool);
    const preview = await previewService.preview(context.organization.id, document);

    if (intent === "preview") {
      return {
        status: "PREVIEW",
        payload,
        preview,
        message: preview.canImport
          ? `${preview.validCases} caso${preview.validCases === 1 ? "" : "s"} listo${preview.validCases === 1 ? "" : "s"} para importar.`
          : `Corrige ${preview.invalidCases} caso${preview.invalidCases === 1 ? "" : "s"} inválido${preview.invalidCases === 1 ? "" : "s"} antes de importar.`,
        importedCount: 0,
      };
    }

    if (!preview.canImport) {
      return {
        status: "PREVIEW",
        payload,
        preview,
        message: "La importación fue bloqueada porque el dry-run contiene errores.",
        importedCount: 0,
      };
    }

    const service = new GoldStandardService(context.pool);
    const result = await service.importHistoricalCases(
      context.organization.id,
      document,
      context.access.user.id,
    );
    const caseCodes = result.imported.map((item) => item.case.caseCode);
    await appendSecurityAuditEvent(
      context,
      "GOLD_STANDARD_HISTORICAL_IMPORT",
      "GOLD_STANDARD_BATCH",
      null,
      { count: result.imported.length, caseCodes },
    );
    revalidatePath("/gold-standard");

    return {
      status: "IMPORTED",
      payload: "",
      preview: null,
      message: `${result.imported.length} referencia${result.imported.length === 1 ? "" : "s"} histórica${result.imported.length === 1 ? "" : "s"} importada${result.imported.length === 1 ? "" : "s"}.`,
      importedCount: result.imported.length,
    };
  } catch (error) {
    return errorState(payload, safeImportError(error));
  }
}

function errorState(payload: string, message: string): GoldStandardImportActionState {
  return {
    status: "ERROR",
    payload,
    preview: null,
    message,
    importedCount: 0,
  };
}

function safeImportError(error: unknown): string {
  if (error instanceof PersistenceError) return error.message;
  return "No se pudo validar o importar el lote. Revisa el formato y vuelve a previsualizar.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
