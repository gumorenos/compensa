"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EvidenceSourceType } from "../persistence/database.js";
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

function evidenceSource(formData: FormData): EvidenceSourceType {
  const value = requiredText(formData, "evidenceSourceType");
  if (value !== "JOB_DESCRIPTION" && value !== "INTERVIEW" && value !== "OTHER") {
    throw new Error("Invalid evidence source type.");
  }
  return value;
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

export async function saveJobDescriptionAction(formData: FormData): Promise<void> {
  const context = await getDemoContext();
  const jobId = requiredText(formData, "jobId");
  await context.repository.createJobDescriptionVersion(context.organization.id, jobId, {
    content: requiredText(formData, "content"),
    sourceLabel: optionalText(formData, "sourceLabel"),
  });

  revalidatePath(`/jobs/${jobId}`);
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

export async function saveDecisionSupportAction(formData: FormData): Promise<void> {
  const context = await getDemoContext();
  const valuationId = requiredText(formData, "valuationId");
  const excerpt = optionalText(formData, "evidenceExcerpt");

  await context.service.saveDecisionSupport(context.organization.id, valuationId, {
    dimensionCode: requiredText(formData, "dimensionCode"),
    justification: optionalText(formData, "justification"),
    ...(excerpt === null
      ? {}
      : {
          evidence: {
            sourceType: evidenceSource(formData),
            sourceSection: optionalText(formData, "evidenceSection"),
            excerpt,
          },
        }),
  });

  revalidatePath(`/valuations/${valuationId}`);
}

export async function deleteEvidenceAction(formData: FormData): Promise<void> {
  const context = await getDemoContext();
  const valuationId = requiredText(formData, "valuationId");
  await context.service.deleteEvidence(
    context.organization.id,
    valuationId,
    requiredText(formData, "evidenceId"),
  );
  revalidatePath(`/valuations/${valuationId}`);
}

export async function submitForReviewAction(formData: FormData): Promise<void> {
  const context = await getDemoContext();
  const valuationId = requiredText(formData, "valuationId");
  await context.service.submitForReview(
    context.organization.id,
    valuationId,
    optionalText(formData, "comment"),
  );
  revalidatePath("/");
  revalidatePath(`/valuations/${valuationId}`);
}

export async function returnForChangesAction(formData: FormData): Promise<void> {
  const context = await getDemoContext();
  const valuationId = requiredText(formData, "valuationId");
  await context.service.returnForChanges(
    context.organization.id,
    valuationId,
    requiredText(formData, "comment"),
  );
  revalidatePath("/");
  revalidatePath(`/valuations/${valuationId}`);
}

export async function approveValuationAction(formData: FormData): Promise<void> {
  const context = await getDemoContext();
  const valuationId = requiredText(formData, "valuationId");
  await context.service.approve(
    context.organization.id,
    valuationId,
    optionalText(formData, "comment"),
  );
  revalidatePath("/");
  revalidatePath(`/valuations/${valuationId}`);
}
