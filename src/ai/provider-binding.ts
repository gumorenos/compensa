import type { AIAssistanceProvider } from "./contracts.js";
import { LocalFixtureAIAssistanceProvider } from "./local-fixture-provider.js";

export type AIProcessingMode = "LOCAL" | "EXTERNAL";

export interface AIAssistanceProviderBinding {
  provider: AIAssistanceProvider;
  promptVersion: string;
  processingMode: AIProcessingMode;
  displayName: string;
  testFixture: boolean;
}

export interface ProviderBindingEnvironment {
  [key: string]: string | undefined;
  COMPENSA_AI_FIXTURE_ENABLED?: string;
}

/**
 * Returns the only provider binding currently implemented by Compensa.
 *
 * Default is no provider. Enabling the fixture is an explicit server-side opt-in
 * and still performs no external processing or network access.
 */
export function getAIAssistanceProviderBinding(
  environment: ProviderBindingEnvironment = process.env,
): AIAssistanceProviderBinding | null {
  if (environment.COMPENSA_AI_FIXTURE_ENABLED !== "true") return null;

  return {
    provider: new LocalFixtureAIAssistanceProvider(),
    promptVersion: "local-fixture-workflow-v1",
    processingMode: "LOCAL",
    displayName: "Fixture local determinístico",
    testFixture: true,
  };
}
