"use server";

import { revalidatePath } from "next/cache";
import type { AIAssistanceResolutionInput } from "../ai/resolution.js";
import { getAIAssistanceProviderBinding } from "../ai/provider-binding.js";
import { AIAssistanceWorkflowService } from "../application/ai-assistance-workflow-service.js";
import { getAppContext } from "./runtime.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateAIAssistanceAction(formData: FormData): Promise<void> {
  const context = await getAppContext("EVALUATE");
  const valuationId = requiredUuid(formData, "valuationId");
  const workflow = new AIAssistanceWorkflowService(
    context.pool,
    getAIAssistanceProviderBinding(),
  );

  await workflow.generate(context.organization.id, valuationId, context.access.user.id);
  revalidateValuationPaths(valuationId);
}

export async function resolveAIAssistanceSuggestionAction(formData: FormData): Promise<void> {
  const context = await getAppContext("EVALUATE");
  const valuationId = requiredUuid(formData, "valuationId");
  const suggestionId = requiredUuid(formData, "suggestionId");
  const resolution = requiredText(formData, "resolution");
  const note = optionalText(formData, "note");
  const justification = optionalText(formData, "justification");

  let input: AIAssistanceResolutionInput;
  if (resolution === "ACCEPTED") {
    input = { resolution, note, justification };
  } else if (resolution === "MODIFIED") {
    input = {
      resolution,
      resolvedLevelCode: requiredText(formData, "resolvedLevelCode"),
      note,
      justification,
    };
  } else if (resolution === "REJECTED") {
    input = { resolution, note };
  } else {
    throw new Error("Invalid AI assistance resolution.");
  }

  const workflow = new AIAssistanceWorkflowService(
    context.pool,
    getAIAssistanceProviderBinding(),
  );
  await workflow.resolve(
    context.organization.id,
    valuationId,
    suggestionId,
    context.access.user.id,
    input,
  );
  revalidateValuationPaths(valuationId);
}

function requiredUuid(formData: FormData, field: string): string {
  const value = requiredText(formData, field);
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${field} is not a valid UUID.`);
  }
  return value;
}

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

function revalidateValuationPaths(valuationId: string): void {
  revalidatePath(`/valuations/${valuationId}`);
  revalidatePath(`/valuations/${valuationId}/ai-assistance`);
}
