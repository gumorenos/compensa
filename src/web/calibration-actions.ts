"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalibrationService } from "../application/calibration-service.js";
import type { ValuationSelections } from "../domain/methodology.js";
import { appendSecurityAuditEvent, getAppContext } from "./runtime.js";

export async function createCalibrationRunAction(formData: FormData): Promise<void> {
  const context = await getAppContext("MANAGE_CALIBRATION");
  const name = requiredText(formData, "name");
  const methodologyVersionId = requiredText(formData, "methodologyVersionId");
  const partitionValue = requiredText(formData, "partition");
  if (partitionValue !== "CALIBRATION" && partitionValue !== "HOLDOUT") {
    throw new Error("Partición de calibración inválida.");
  }
  const candidateLabel = optionalText(formData, "candidateLabel");
  const service = new CalibrationService(context.pool);
  const created = await service.createRun(context.organization.id, {
    name,
    methodologyVersionId,
    partition: partitionValue,
    candidateSource: "MANUAL",
    candidateLabel,
    createdByUserId: context.access.user.id,
  });
  await appendSecurityAuditEvent(
    context,
    "CALIBRATION_RUN_CREATED",
    "CALIBRATION_RUN",
    created.run.id,
    {
      partition: created.run.partition,
      methodologyVersionId: created.run.methodologyVersionId,
      caseCount: created.cases.length,
    },
  );
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
  const completed = await new CalibrationService(context.pool).completeRun(
    context.organization.id,
    runId,
  );
  await appendSecurityAuditEvent(
    context,
    "CALIBRATION_RUN_COMPLETED",
    "CALIBRATION_RUN",
    completed.id,
    {
      partition: completed.partition,
      methodologyVersionId: completed.methodologyVersionId,
      summary: completed.summary,
    },
  );
  revalidatePath("/calibration");
  revalidatePath(`/calibration/${runId}`);
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
