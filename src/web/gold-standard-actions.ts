"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GoldStandardService } from "../application/gold-standard-service.js";
import type { GoldStandardPartition } from "../domain/gold-standard.js";
import { updateGoldStandardAnchor } from "../persistence/gold-standard-management.js";
import { appendSecurityAuditEvent, getAppContext } from "./runtime.js";

function requiredText(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function optionalText(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function partitionValue(formData: FormData): GoldStandardPartition {
  const value = requiredText(formData, "partition");
  if (value !== "UNASSIGNED" && value !== "CALIBRATION" && value !== "HOLDOUT") {
    throw new Error("Invalid Gold Standard partition.");
  }
  return value;
}

function checked(formData: FormData, field: string): boolean {
  const value = formData.get(field);
  return value === "on" || value === "true" || value === "1";
}

export async function captureGoldStandardAction(formData: FormData): Promise<void> {
  const context = await getAppContext("MANAGE_GOLD_STANDARD");
  const service = new GoldStandardService(context.pool);
  const valuationId = requiredText(formData, "valuationId");
  const captured = await service.captureApprovedValuation(
    context.organization.id,
    valuationId,
    {
      caseCode: requiredText(formData, "caseCode"),
      anonymizedLabel: requiredText(formData, "anonymizedLabel"),
      partition: partitionValue(formData),
      isAnchor: checked(formData, "isAnchor"),
      expertUserId: null,
      createdByUserId: context.access.user.id,
      notes: optionalText(formData, "notes"),
    },
  );

  await appendSecurityAuditEvent(
    context,
    "GOLD_STANDARD_CAPTURED",
    "GOLD_STANDARD_CASE",
    captured.case.id,
    {
      valuationId,
      caseCode: captured.case.caseCode,
      partition: captured.case.partition,
      isAnchor: captured.case.isAnchor,
    },
  );

  revalidatePath("/gold-standard");
  redirect(`/gold-standard/${captured.case.id}`);
}

export async function assignGoldStandardPartitionAction(formData: FormData): Promise<void> {
  const context = await getAppContext("MANAGE_GOLD_STANDARD");
  const service = new GoldStandardService(context.pool);
  const caseId = requiredText(formData, "caseId");
  const partition = partitionValue(formData);
  await service.assignPartition(context.organization.id, caseId, partition);

  await appendSecurityAuditEvent(
    context,
    "GOLD_STANDARD_PARTITION_CHANGED",
    "GOLD_STANDARD_CASE",
    caseId,
    { partition },
  );

  revalidatePath("/gold-standard");
  revalidatePath(`/gold-standard/${caseId}`);
}

export async function setGoldStandardAnchorAction(formData: FormData): Promise<void> {
  const context = await getAppContext("MANAGE_GOLD_STANDARD");
  const caseId = requiredText(formData, "caseId");
  const isAnchor = checked(formData, "isAnchor");
  await updateGoldStandardAnchor(
    context.organization.id,
    caseId,
    isAnchor,
    context.pool,
  );

  await appendSecurityAuditEvent(
    context,
    "GOLD_STANDARD_ANCHOR_CHANGED",
    "GOLD_STANDARD_CASE",
    caseId,
    { isAnchor },
  );

  revalidatePath("/gold-standard");
  revalidatePath(`/gold-standard/${caseId}`);
}
