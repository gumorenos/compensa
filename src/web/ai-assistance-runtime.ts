import type { MethodologyDefinition } from "../domain/methodology.js";
import {
  AIAssistanceWorkflowService,
  type AIAssistanceWorkflowState,
} from "../application/ai-assistance-workflow-service.js";
import { getAIAssistanceProviderBinding } from "../ai/provider-binding.js";
import { getAppContext } from "./runtime.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AIAssistancePageData {
  organizationName: string;
  valuationId: string;
  valuationStatus: string;
  jobName: string;
  methodology: MethodologyDefinition;
  canEvaluate: boolean;
  workflow: AIAssistanceWorkflowState;
}

export async function getAIAssistancePageData(
  valuationId: string,
): Promise<AIAssistancePageData | null> {
  if (!UUID_PATTERN.test(valuationId)) return null;

  const context = await getAppContext("VIEW");
  const snapshot = await context.service.getSnapshot(context.organization.id, valuationId);
  if (snapshot === null) return null;

  const [job, methodology] = await Promise.all([
    context.repository.getJob(context.organization.id, snapshot.valuation.jobId),
    context.repository.getMethodologyVersionForOrganization(
      context.organization.id,
      snapshot.valuation.methodologyVersionId,
    ),
  ]);
  if (job === null || methodology === null) return null;

  const workflow = await new AIAssistanceWorkflowService(
    context.pool,
    getAIAssistanceProviderBinding(),
  ).getState(context.organization.id, valuationId);

  return {
    organizationName: context.organization.name,
    valuationId,
    valuationStatus: snapshot.valuation.status,
    jobName: job.name,
    methodology: methodology.definition,
    canEvaluate: context.capabilities.canEvaluate,
    workflow,
  };
}
