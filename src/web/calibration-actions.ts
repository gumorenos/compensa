"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalibrationService } from "../application/calibration-service.js";
import type { ValuationSelections } from "../domain/methodology.js";
import { getAppContext } from "./runtime.js";

export async function createCalibrationRunAction(formData: FormData): Promise<void> {
  const context = await getAppContext("MANAGE_CALIBRATION");
  const name = requiredText(formData, "name");
  const scope = parseScope(requiredText(formData, "scope"));
  const candidateLabel = optionalText(formData, "candidateLabel");
  const service = new CalibrationService(context.pool);
  const created = await service.createRun(context.organization.id, {
    name,
    methodologyVersionId: scope.methodologyVersionId,
    partition: scope.partition,
    candidateSource: "MANUAL",
    candidateLabel,
    createdByUserId: context.access.user.id,
  });
  revalidatePath("/calibration");
  redirect(`/calibration/${created.run.id}`);
}

export async function saveCalibrationCaseAction(formData: FormData): Promise<void> {
  const context = await getAppContext("MANAGE_CALIBRATION");
  const runId = requiredText(formData, "runId");
  const caseId = requiredText(formData, "caseId");
  const selections: ValuationSelections = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("selection__") || typeof value !== "string") continue;
    const dimensionCode = key.slice("selection__".length).trim();
    const levelCode = value.trim();
    if (dimensionCode !== "" && levelCode !== "") selections[dimensionCode] = levelCode;
  }
  await new CalibrationService(context.pool).saveCandidate(
    context.organization.id,
    runId,
    caseId,
    selections,
  );
  revalidatePath(`/calibration/${runId}`);
}

export async function completeCalibrationRunAction(formData: FormData): Promise<void> {
  const context = await getAppContext("MANAGE_CALIBRATION");
  const runId = requiredText(formData, "runId");
  await new CalibrationService(context.pool).completeRun(
    context.organization.id,
    runId,
    context.access.user.id,
  );
  revalidatePath("/calibration");
  revalidatePath(`/calibration/${runId}`);
}

function parseScope(value: string): {
  methodologyVersionId: string;
  partition: "CALIBRATION" | "HOLDOUT";
} {
  const parts = value.split("::");
  if (parts.length !== 2) throw new Error("Conjunto de calibración inválido.");
  const methodologyVersionId = parts[0]?.trim() ?? "";
  const partition = parts[1]?.trim() ?? "";
  if (methodologyVersionId === "" || (partition !== "CALIBRATION" && partition !== "HOLDOUT")) {
    throw new Error("Conjunto de calibración inválido.");
  }
  return { methodologyVersionId, partition };
}

function requiredText(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} es obligatorio.`);
  return value.trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
