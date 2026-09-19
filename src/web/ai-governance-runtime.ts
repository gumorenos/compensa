import {
  AIProviderConfigurationService,
  type AIProviderConfiguration,
} from "../application/ai-provider-configuration-service.js";
import { AIGovernanceService, type AIAssistanceSettings } from "../application/ai-governance-service.js";
import { getAppContext } from "./runtime.js";

export interface AIGovernancePageData {
  organization: {
    id: string;
    name: string;
  };
  settings: AIAssistanceSettings;
  providerConfiguration: AIProviderConfiguration | null;
}

export async function getAIGovernancePageData(): Promise<AIGovernancePageData> {
  const context = await getAppContext("MANAGE_AI_ASSISTANCE");
  const governanceService = new AIGovernanceService(context.pool);
  const providerConfigurationService = new AIProviderConfigurationService(context.pool);
  const [settings, providerConfiguration] = await Promise.all([
    governanceService.getSettings(context.organization.id),
    providerConfigurationService.getConfiguration(context.organization.id),
  ]);

  return {
    organization: {
      id: context.organization.id,
      name: context.organization.name,
    },
    settings,
    providerConfiguration,
  };
}
