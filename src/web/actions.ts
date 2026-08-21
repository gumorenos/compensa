"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDemoContext } from "./runtime.js";

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

export async function createJobAction(formData: FormData): Promise<void> {
  const context = await getDemoContext();
  const job = await context.repository.createJob(context.organization.id, {
    name: requiredText(formData, "name"),
    code: optionalText(formData, "code"),
    department: optionalText(formData, "department"),
    area: optionalText(formData, "area"),
    jobFamily: optionalText(formData, "jobFamily"),
  });

  revalidatePath("/");
  redirect(`/jobs/${job.id}`);
}

export async function startValuationAction(formData: FormData): Promise<void> {
  const context = await getDemoContext();
  const jobId = requiredText(formData, "jobId");
  const methodologyVersionId = requiredText(formData, "methodologyVersionId");
  const valuation = await context.service.startValuation(
    context.organization.id,
    jobId,
    methodologyVersionId,
  );

  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/valuations/${valuation.id}`);
}

export async function saveDecisionAction(formData: FormData): Promise<void> {
  const context = await getDemoContext();
  const valuationId = requiredText(formData, "valuationId");
  await context.service.saveDecision(context.organization.id, valuationId, {
    dimensionCode: requiredText(formData, "dimensionCode"),
    selectedLevelCode: requiredText(formData, "selectedLevelCode"),
    source: "MANUAL",
  });

  revalidatePath("/");
  revalidatePath(`/valuations/${valuationId}`);
}
