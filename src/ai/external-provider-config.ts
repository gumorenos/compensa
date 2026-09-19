export type ExternalAIProviderConfigurationState =
  | "NOT_CONFIGURED"
  | "INVALID"
  | "CONFIGURED";

export type ExternalAIProviderConfigurationIssueCode =
  | "PARTIAL_CONFIGURATION"
  | "INVALID_PROVIDER_ID"
  | "INVALID_SERVICE_ID"
  | "INVALID_MODEL_ID"
  | "INVALID_SECRET_REFERENCE"
  | "PROVIDER_NOT_ALLOWLISTED";

export interface ExternalAIProviderConfigurationStatus {
  state: ExternalAIProviderConfigurationState;
  providerId: string | null;
  serviceId: string | null;
  modelId: string | null;
  secretReferenceConfigured: boolean;
  allowlisted: boolean;
  adapterAvailable: false;
  issues: ExternalAIProviderConfigurationIssueCode[];
}

export interface ExternalAIProviderConfigurationEnvironment {
  [key: string]: string | undefined;
  COMPENSA_AI_EXTERNAL_ALLOWED_PROVIDERS?: string;
  COMPENSA_AI_EXTERNAL_PROVIDER_ID?: string;
  COMPENSA_AI_EXTERNAL_SERVICE_ID?: string;
  COMPENSA_AI_EXTERNAL_MODEL_ID?: string;
  COMPENSA_AI_EXTERNAL_SECRET_REF?: string;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SECRET_REF_PATTERN = /^env:[A-Z][A-Z0-9_]{0,127}$/;
const MAX_MODEL_ID_LENGTH = 200;

/**
 * Parses only non-secret metadata for a future external AI adapter.
 *
 * The secret reference is deliberately reduced to a boolean in the returned
 * status. This module never dereferences it and never returns its name or value.
 * A configured tuple therefore still cannot produce network traffic by itself.
 */
export function getExternalAIProviderConfigurationStatus(
  environment: ExternalAIProviderConfigurationEnvironment = process.env,
): ExternalAIProviderConfigurationStatus {
  const providerId = optionalValue(environment.COMPENSA_AI_EXTERNAL_PROVIDER_ID);
  const serviceId = optionalValue(environment.COMPENSA_AI_EXTERNAL_SERVICE_ID);
  const modelId = optionalValue(environment.COMPENSA_AI_EXTERNAL_MODEL_ID);
  const secretRef = optionalValue(environment.COMPENSA_AI_EXTERNAL_SECRET_REF);
  const configuredParts = [providerId, serviceId, modelId, secretRef].filter(
    (value) => value !== null,
  ).length;

  if (configuredParts === 0) {
    return {
      state: "NOT_CONFIGURED",
      providerId: null,
      serviceId: null,
      modelId: null,
      secretReferenceConfigured: false,
      allowlisted: false,
      adapterAvailable: false,
      issues: [],
    };
  }

  const issues: ExternalAIProviderConfigurationIssueCode[] = [];
  if (configuredParts !== 4) issues.push("PARTIAL_CONFIGURATION");
  if (providerId !== null && !ID_PATTERN.test(providerId)) issues.push("INVALID_PROVIDER_ID");
  if (serviceId !== null && !ID_PATTERN.test(serviceId)) issues.push("INVALID_SERVICE_ID");
  if (modelId !== null && !validModelId(modelId)) issues.push("INVALID_MODEL_ID");
  if (secretRef !== null && !SECRET_REF_PATTERN.test(secretRef)) {
    issues.push("INVALID_SECRET_REFERENCE");
  }

  const allowedProviders = parseAllowlist(environment.COMPENSA_AI_EXTERNAL_ALLOWED_PROVIDERS);
  const allowlisted = providerId !== null && allowedProviders.has(providerId);
  if (providerId !== null && !allowlisted) issues.push("PROVIDER_NOT_ALLOWLISTED");

  return {
    state: issues.length === 0 && configuredParts === 4 ? "CONFIGURED" : "INVALID",
    providerId,
    serviceId,
    modelId,
    secretReferenceConfigured: secretRef !== null && SECRET_REF_PATTERN.test(secretRef),
    allowlisted,
    adapterAvailable: false,
    issues: [...new Set(issues)],
  };
}

function optionalValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseAllowlist(value: string | undefined): Set<string> {
  if (value === undefined) return new Set();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== ""),
  );
}

function validModelId(value: string): boolean {
  if (value.length > MAX_MODEL_ID_LENGTH) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}
