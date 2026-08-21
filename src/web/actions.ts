"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EvidenceSourceType } from "../persistence/database.js";
import {
  appendSecurityAuditEvent,
  attachActorToLatestReviewAction,
  getAppContext,
} from "./runtime.js";

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
  const context = await getAppContext("MANAGE_JOBS");
  const job = await context.repository.createJob(context.organization.id, {
    name: requiredText(formData, "name"),
    code: optionalText(formData, "code"),
    department: optionalText(formData, "department"),
    area: optionalText(formData, "area"),
    jobFamily: optionalText(formData, "jobFamily"),
  });
  await appendSecurityAuditEvent(context, "JOB_CREATED", "JOB", job.id, { name: job.name });

  revalidatePath("/");
  redirect(`/jobs/${job.id}`);
}

export async function saveJobDescriptionAction(formData: FormData): Promise<void> {
  const context = await getAppContext("MANAGE_JOBS");
  const jobId = requiredText(formData, "jobId");
  const description = await context.repository.createJobDescriptionVersion(
    context.organization.id,
    jobId,
    {
      content: requiredText(formData, "content"),
      sourceLabel: optionalText(formData, "sourceLabel"),
    },
  );
  await appendSecurityAuditEvent(
    context,
    "JOB_DESCRIPTION_VERSION_CREATED",
    "JOB_DESCRIPTION",
    description.id,
    { jobId, version: description.version },
  );

  revalidatePath(`/jobs/${jobId}`);
}

export async function startValuationAction(formData: FormData): Promise<void> {
  const context = await getAppContext("EVALUATE");
  const jobId = requiredText(formData, "jobId");
  const methodologyVersionId = requiredText(formData, "methodologyVersionId");
  const valuation = await context.service.startValuation(
    context.organization.id,
    jobId,
    methodologyVersionId,
  );
  await appendSecurityAuditEvent(context, "VALUATION_STARTED", "VALUATION", valuation.id, {
    jobId,
    methodologyVersionId,
    version: valuation.version,
  });

  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/valuations/${valuation.id}`);
}

export async function saveDecisionAction(formData: FormData): Promise<void> {
  const context = await getAppContext("EVALUATE");
  const valuationId = requiredText(formData, "valuationId");
  const dimensionCode = requiredText(formData, "dimensionCode");
  const selectedLevelCode = requiredText(formData, "selectedLevelCode");
  await context.service.saveDecision(context.organization.id, valuationId, {
    dimensionCode,
    selectedLevelCode,
    source: "MANUAL",
  });
  await appendSecurityAuditEvent(context, "VALUATION_DECISION_SAVED", "VALUATION", valuationId, {
    dimensionCode,
    selectedLevelCode,
  });

  revalidatePath("/");
  revalidatePath(`/valuations/${valuationId}`);
}

export async function saveDecisionSupportAction(formData: FormData): Promise<void> {
  const context = await getAppContext("EVALUATE");
  const valuationId = requiredText(formData, "valuationId");
  const dimensionCode = requiredText(formData, "dimensionCode");
  const excerpt = optionalText(formData, "evidenceExcerpt");
  const sourceType = excerpt === null ? null : evidenceSource(formData);

  await context.service.saveDecisionSupport(context.organization.id, valuationId, {
    dimensionCode,
    justification: optionalText(formData, "justification"),
    ...(excerpt === null || sourceType === null
      ? {}
      : {
          evidence: {
            sourceType,
            sourceSection: optionalText(formData, "evidenceSection"),
            excerpt,
          },
        }),
  });
  await appendSecurityAuditEvent(context, "VALUATION_SUPPORT_SAVED", "VALUATION", valuationId, {
    dimensionCode,
    evidenceAdded: excerpt !== null,
    evidenceSourceType: sourceType,
  });

  revalidatePath(`/valuations/${valuationId}`);
}

export async function deleteEvidenceAction(formData: FormData): Promise<void> {
  const context = await getAppContext("EVALUATE");
  const valuationId = requiredText(formData, "valuationId");
  const evidenceId = requiredText(formData, "evidenceId");
  await context.service.deleteEvidence(context.organization.id, valuationId, evidenceId);
  await appendSecurityAuditEvent(context, "VALUATION_EVIDENCE_REMOVED", "VALUATION", valuationId, {
    evidenceId,
  });
  revalidatePath(`/valuations/${valuationId}`);
}

export async function submitForReviewAction(formData: FormData): Promise<void> {
  const context = await getAppContext("SUBMIT_REVIEW");
  const valuationId = requiredText(formData, "valuationId");
  await context.service.submitForReview(
    context.organization.id,
    valuationId,
    optionalText(formData, "comment"),
  );
  await attachActorToLatestReviewAction(context, valuationId, "SUBMITTED");
  await appendSecurityAuditEvent(context, "VALUATION_SUBMITTED", "VALUATION", valuationId);
  revalidatePath("/");
  revalidatePath(`/valuations/${valuationId}`);
}

export async function returnForChangesAction(formData: FormData): Promise<void> {
  const context = await getAppContext("REVIEW");
  const valuationId = requiredText(formData, "valuationId");
  await context.service.returnForChanges(
    context.organization.id,
    valuationId,
    requiredText(formData, "comment"),
  );
  await attachActorToLatestReviewAction(context, valuationId, "RETURNED");
  await appendSecurityAuditEvent(context, "VALUATION_RETURNED", "VALUATION", valuationId);
  revalidatePath("/");
  revalidatePath(`/valuations/${valuationId}`);
}

export async function approveValuationAction(formData: FormData): Promise<void> {
  const context = await getAppContext("REVIEW");
  const valuationId = requiredText(formData, "valuationId");
  await context.service.approve(
    context.organization.id,
    valuationId,
    optionalText(formData, "comment"),
  );
  await attachActorToLatestReviewAction(context, valuationId, "APPROVED");
  await appendSecurityAuditEvent(context, "VALUATION_APPROVED", "VALUATION", valuationId);
  revalidatePath("/");
  revalidatePath(`/valuations/${valuationId}`);
}
