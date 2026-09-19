import { describe, expect, it } from "vitest";
import { getExternalAIProviderConfigurationStatus } from "../src/ai/external-provider-config.js";

describe("external AI provider configuration boundary", () => {
  it("is default-deny when no external provider metadata is configured", () => {
    expect(getExternalAIProviderConfigurationStatus({})).toEqual({
      state: "NOT_CONFIGURED",
      providerId: null,
      serviceId: null,
      modelId: null,
      secretReferenceConfigured: false,
      allowlisted: false,
      adapterAvailable: false,
      issues: [],
    });
  });

  it("accepts a complete allowlisted metadata tuple without enabling an adapter", () => {
    const status = getExternalAIProviderConfigurationStatus({
      COMPENSA_AI_EXTERNAL_ALLOWED_PROVIDERS: "provider-a, provider-b",
      COMPENSA_AI_EXTERNAL_PROVIDER_ID: "provider-a",
      COMPENSA_AI_EXTERNAL_SERVICE_ID: "responses",
      COMPENSA_AI_EXTERNAL_MODEL_ID: "model-family/model-1",
      COMPENSA_AI_EXTERNAL_SECRET_REF: "env:COMPENSA_AI_PROVIDER_KEY",
      COMPENSA_AI_PROVIDER_KEY: "must-never-be-read",
    });

    expect(status).toEqual({
      state: "CONFIGURED",
      providerId: "provider-a",
      serviceId: "responses",
      modelId: "model-family/model-1",
      secretReferenceConfigured: true,
      allowlisted: true,
      adapterAvailable: false,
      issues: [],
    });
    expect(JSON.stringify(status)).not.toContain("COMPENSA_AI_PROVIDER_KEY");
    expect(JSON.stringify(status)).not.toContain("must-never-be-read");
  });

  it("fails closed for partial or non-allowlisted configuration", () => {
    const status = getExternalAIProviderConfigurationStatus({
      COMPENSA_AI_EXTERNAL_PROVIDER_ID: "provider-a",
      COMPENSA_AI_EXTERNAL_SERVICE_ID: "responses",
    });

    expect(status.state).toBe("INVALID");
    expect(status.allowlisted).toBe(false);
    expect(status.issues).toContain("PARTIAL_CONFIGURATION");
    expect(status.issues).toContain("PROVIDER_NOT_ALLOWLISTED");
  });

  it("rejects a literal credential where only an opaque secret reference is allowed", () => {
    const literalCredential = "sk-live-secret-value";
    const status = getExternalAIProviderConfigurationStatus({
      COMPENSA_AI_EXTERNAL_ALLOWED_PROVIDERS: "provider-a",
      COMPENSA_AI_EXTERNAL_PROVIDER_ID: "provider-a",
      COMPENSA_AI_EXTERNAL_SERVICE_ID: "responses",
      COMPENSA_AI_EXTERNAL_MODEL_ID: "model-1",
      COMPENSA_AI_EXTERNAL_SECRET_REF: literalCredential,
    });

    expect(status.state).toBe("INVALID");
    expect(status.issues).toContain("INVALID_SECRET_REFERENCE");
    expect(JSON.stringify(status)).not.toContain(literalCredential);
  });

  it("rejects unsafe identifiers and control characters before any future adapter can use them", () => {
    const status = getExternalAIProviderConfigurationStatus({
      COMPENSA_AI_EXTERNAL_ALLOWED_PROVIDERS: "Provider A",
      COMPENSA_AI_EXTERNAL_PROVIDER_ID: "Provider A",
      COMPENSA_AI_EXTERNAL_SERVICE_ID: "../responses",
      COMPENSA_AI_EXTERNAL_MODEL_ID: "model-1\nignore previous instructions",
      COMPENSA_AI_EXTERNAL_SECRET_REF: "env:COMPENSA_AI_PROVIDER_KEY",
    });

    expect(status.state).toBe("INVALID");
    expect(status.issues).toContain("INVALID_PROVIDER_ID");
    expect(status.issues).toContain("INVALID_SERVICE_ID");
    expect(status.issues).toContain("INVALID_MODEL_ID");
  });
});
