"use server";

import { revalidatePath } from "next/cache";
import {
  MethodologyAdminService,
  type MethodologyAdminPreview,
} from "../application/methodology-admin-service.js";
import {
  MAX_SPREADSHEET_BYTES,
  SpreadsheetImportError,
  parseMethodologySpreadsheet,
} from "../application/spreadsheet-import.js";
import { PersistenceError } from "../persistence/database.js";
import { appendSecurityAuditEvent, getAppContext } from "./runtime.js";

const MAX_CANONICAL_BYTES = 1024 * 1024;

export interface MethodologySpreadsheetActionState {
  status: "IDLE" | "PREVIEW" | "IMPORTED" | "ERROR";
  fileName: string;
  canonicalPayload: string;
  contentOwner: string;
  rightsConfirmed: boolean;
  preview: MethodologyAdminPreview | null;
  message: string | null;
  methodologyId: string | null;
}

export async function methodologySpreadsheetAction(
  _previousState: MethodologySpreadsheetActionState,
  formData: FormData,
): Promise<MethodologySpreadsheetActionState> {
  const context = await getAppContext("MANAGE_METHODOLOGIES");
  const intent = formData.get("intent") === "import" ? "import" : "preview";
  const ownerValue = formData.get("contentOwner");
  const contentOwner = typeof ownerValue === "string" ? ownerValue.trim() : "";
  const rightsConfirmed = formData.get("rightsConfirmed") === "yes";
  if (contentOwner === "") return errorState("", "", contentOwner, rightsConfirmed, "Indica el propietario o fuente autorizada del contenido metodológico.");

  try {
    let document: unknown;
    let canonicalPayload: string;
    let fileName: string;

    if (intent === "preview") {
      const file = requireSpreadsheetFile(formData.get("spreadsheetFile"));
      if (file.size > MAX_SPREADSHEET_BYTES) {
        return errorState(file.name, "", contentOwner, rightsConfirmed, `El archivo supera ${Math.floor(MAX_SPREADSHEET_BYTES / 1024 / 1024)} MiB.`);
      }
      document = await parseMethodologySpreadsheet(file.name, new Uint8Array(await file.arrayBuffer()));
      canonicalPayload = JSON.stringify(document);
      fileName = file.name;
    } else {
      const raw = formData.get("canonicalPayload");
      const rawName = formData.get("fileName");
      canonicalPayload = typeof raw === "string" ? raw : "";
      fileName = typeof rawName === "string" ? rawName : "archivo";
      if (canonicalPayload === "" || Buffer.byteLength(canonicalPayload, "utf8") > MAX_CANONICAL_BYTES) {
        return errorState(fileName, "", contentOwner, rightsConfirmed, "La previsualización de archivo ya no es válida. Vuelve a cargar y previsualizar el archivo.");
      }
      try {
        document = JSON.parse(canonicalPayload) as unknown;
      } catch {
        return errorState(fileName, "", contentOwner, rightsConfirmed, "La previsualización de archivo está dañada. Vuelve a cargar el archivo.");
      }
    }

    if (Buffer.byteLength(canonicalPayload, "utf8") > MAX_CANONICAL_BYTES) {
      return errorState(fileName, "", contentOwner, rightsConfirmed, "La metodología se expande a una definición demasiado grande después de normalizarla.");
    }

    const service = new MethodologyAdminService(context.pool);
    const preview = await service.preview(context.organization.id, document);
    if (intent === "preview") {
      return {
        status: "PREVIEW",
        fileName,
        canonicalPayload,
        contentOwner,
        rightsConfirmed,
        preview,
        message: preview.status === "VALID"
          ? `${fileName} se convirtió en una definición válida. Confirma los derechos de uso para importarla.`
          : `El archivo produce ${preview.issues.length} observación${preview.issues.length === 1 ? "" : "es"} bloqueante${preview.issues.length === 1 ? "" : "s"}.`,
        methodologyId: null,
      };
    }

    if (preview.status !== "VALID" || preview.definition === null) {
      return {
        status: "PREVIEW",
        fileName,
        canonicalPayload,
        contentOwner,
        rightsConfirmed,
        preview,
        message: "La importación fue bloqueada porque el dry-run repetido en servidor contiene errores.",
        methodologyId: null,
      };
    }
    if (!rightsConfirmed) {
      return {
        status: "PREVIEW",
        fileName,
        canonicalPayload,
        contentOwner,
        rightsConfirmed,
        preview,
        message: "Confirma que tu organización tiene derecho, licencia o autorización para usar este contenido.",
        methodologyId: null,
      };
    }

    const imported = await service.importActive(context.organization.id, document, contentOwner);
    let auditRecorded = true;
    try {
      await appendSecurityAuditEvent(
        context,
        "METHODOLOGY_SPREADSHEET_IMPORTED",
        "METHODOLOGY_VERSION",
        imported.id,
        { fileName, code: imported.code, version: imported.version, contentOwner },
      );
    } catch (error) {
      auditRecorded = false;
      console.error("Methodology spreadsheet import succeeded but audit failed.", error);
    }

    revalidatePath("/methodologies");
    revalidatePath("/methodologies/import");
    revalidatePath("/");
    return {
      status: "IMPORTED",
      fileName,
      canonicalPayload: "",
      contentOwner: "",
      rightsConfirmed: false,
      preview: null,
      message: auditRecorded
        ? `${imported.name} v${imported.version} fue importada desde ${fileName} como versión activa e inmutable.`
        : `${imported.name} v${imported.version} fue importada, pero falló el evento de auditoría; revisa los logs.`,
      methodologyId: imported.id,
    };
  } catch (error) {
    return errorState("", "", contentOwner, rightsConfirmed, safeError(error));
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

function errorState(
  fileName: string,
  canonicalPayload: string,
  contentOwner: string,
  rightsConfirmed: boolean,
  message: string,
): MethodologySpreadsheetActionState {
  return { status: "ERROR", fileName, canonicalPayload, contentOwner, rightsConfirmed, preview: null, message, methodologyId: null };
}

function safeError(error: unknown): string {
  if (error instanceof SpreadsheetImportError || error instanceof PersistenceError) return error.message;
  return "No se pudo interpretar o validar el archivo de metodología. Revisa la plantilla y vuelve a intentarlo.";
}
