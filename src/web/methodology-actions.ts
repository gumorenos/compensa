"use server";

import { revalidatePath } from "next/cache";
import {
  MethodologyAdminService,
  type MethodologyAdminPreview,
} from "../application/methodology-admin-service.js";
import { PersistenceError } from "../persistence/database.js";
import { appendSecurityAuditEvent, getAppContext } from "./runtime.js";

const MAX_METHODOLOGY_BYTES = 512 * 1024;

export interface MethodologyImportActionState {
  status: "IDLE" | "PREVIEW" | "IMPORTED" | "ERROR";
  payload: string;
  contentOwner: string;
  rightsConfirmed: boolean;
  preview: MethodologyAdminPreview | null;
  message: string | null;
  methodologyId: string | null;
}

export async function methodologyImportAction(
  _previousState: MethodologyImportActionState,
  formData: FormData,
): Promise<MethodologyImportActionState> {
  const context = await getAppContext("MANAGE_METHODOLOGIES");
  const rawPayload = formData.get("payload");
  const rawOwner = formData.get("contentOwner");
  const intent = formData.get("intent") === "import" ? "import" : "preview";
  const payload = typeof rawPayload === "string" ? rawPayload.trim() : "";
  const contentOwner = typeof rawOwner === "string" ? rawOwner.trim() : "";
  const rightsConfirmed = formData.get("rightsConfirmed") === "yes";

  if (payload === "") return errorState(payload, contentOwner, rightsConfirmed, "Pega una definición JSON antes de previsualizar.");
  if (contentOwner === "") {
    return errorState(payload, contentOwner, rightsConfirmed, "Indica el propietario o fuente autorizada del contenido metodológico.");
  }
  if (Buffer.byteLength(payload, "utf8") > MAX_METHODOLOGY_BYTES) {
    return errorState(payload, contentOwner, rightsConfirmed, "La definición supera el límite de 512 KiB de esta primera versión.");
  }

  let document: unknown;
  try {
    document = JSON.parse(payload) as unknown;
  } catch {
    return errorState(payload, contentOwner, rightsConfirmed, "La definición no es JSON válido.");
  }

  try {
    const service = new MethodologyAdminService(context.pool);
    const preview = await service.preview(context.organization.id, document);

    if (intent === "preview") {
      return {
        status: "PREVIEW",
        payload,
        contentOwner,
        rightsConfirmed,
        preview,
        message: preview.status === "VALID"
          ? "Definición válida. Revisa el resumen y confirma los derechos de uso antes de importarla."
          : `La definición tiene ${preview.issues.length} observación${preview.issues.length === 1 ? "" : "es"} bloqueante${preview.issues.length === 1 ? "" : "s"}.`,
        methodologyId: null,
      };
    }

    if (preview.status !== "VALID" || preview.definition === null) {
      return {
        status: "PREVIEW",
        payload,
        contentOwner,
        rightsConfirmed,
        preview,
        message: "La importación fue bloqueada porque el dry-run contiene errores.",
        methodologyId: null,
      };
    }
    if (!rightsConfirmed) {
      return {
        status: "PREVIEW",
        payload,
        contentOwner,
        rightsConfirmed,
        preview,
        message: "Confirma que tienes derecho o autorización para usar este contenido metodológico.",
        methodologyId: null,
      };
    }

    const imported = await service.importActive(context.organization.id, document, contentOwner);
    let auditRecorded = true;
    try {
      await appendSecurityAuditEvent(
        context,
        "METHODOLOGY_VERSION_IMPORTED",
        "METHODOLOGY_VERSION",
        imported.id,
        {
          code: imported.code,
          version: imported.version,
          contentOwner: imported.contentOwner,
        },
      );
    } catch (error) {
      auditRecorded = false;
      console.error("Methodology import succeeded but its security audit event failed.", error);
    }

    revalidatePath("/methodologies");
    revalidatePath("/methodologies/import");
    revalidatePath("/");

    return {
      status: "IMPORTED",
      payload: "",
      contentOwner: "",
      rightsConfirmed: false,
      preview: null,
      message: auditRecorded
        ? `${imported.name} v${imported.version} fue importada como versión activa e inmutable.`
        : `${imported.name} v${imported.version} fue importada, pero falló el evento de auditoría; revisa los logs del servidor.`,
      methodologyId: imported.id,
    };
  } catch (error) {
    return errorState(payload, contentOwner, rightsConfirmed, safeError(error));
  }
}

function errorState(
  payload: string,
  contentOwner: string,
  rightsConfirmed: boolean,
  message: string,
): MethodologyImportActionState {
  return {
    status: "ERROR",
    payload,
    contentOwner,
    rightsConfirmed,
    preview: null,
    message,
    methodologyId: null,
  };
}

function safeError(error: unknown): string {
  if (error instanceof PersistenceError) return error.message;
  return "No se pudo validar o importar la metodología. Revisa la definición y vuelve a previsualizar.";
}
