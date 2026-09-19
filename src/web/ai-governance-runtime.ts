import {
  getExternalAIProviderConfigurationStatus,
  type ExternalAIProviderConfigurationStatus,
} from "../ai/external-provider-config.js";
import { AIGovernanceService, type AIAssistanceSettings } from "../application/ai-governance-service.js";
import { getAppContext } from "./runtime.js";

export interface AIGovernancePageData {
  organization: {
    id: string;
    name: string;
  };
  settings: AIAssistanceSettings;
  externalProvider: ExternalAIProviderConfigurationStatus;
}

export async function getAIGovernancePageData(): Promise<AIGovernancePageData> {
  const context = await getAppContext("MANAGE_AI_ASSISTANCE");
  const service = new AIGovernanceService(context.pool);
  const settings = await service.getSettings(context.organization.id);

  return {
    organization: {
      id: context.organization.id,
      name: context.organization.name,
    },
    settings,
    externalProvider: getExternalAIProviderConfigurationStatus(),
  };
}
