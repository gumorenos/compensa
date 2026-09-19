import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("AI provider configuration UI contract", () => {
  it("keeps provider metadata behind the existing ADMIN governance permission", async () => {
    const runtime = await source("src/web/ai-governance-runtime.ts");
    const actions = await source("src/web/ai-governance-actions.ts");

    expect(runtime).toContain('getAppContext("MANAGE_AI_ASSISTANCE")');
    expect(actions.match(/getAppContext\("MANAGE_AI_ASSISTANCE"\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("collects a credential reference and never an API key", async () => {
    const page = await source("app/ai-assistance/page.tsx");

    expect(page).toContain('name="providerId"');
    expect(page).toContain('name="modelId"');
    expect(page).toContain('name="credentialReference"');
    expect(page).toContain("COMPENSA_AI_CREDENTIAL_");
    expect(page).toContain("No pegues una API key aquí.");
    expect(page).not.toContain('name="apiKey"');
    expect(page).not.toContain('name="secret"');
  });

  it("does not turn metadata configuration into provider invocation", async () => {
    const files = await Promise.all([
      source("app/ai-assistance/page.tsx"),
      source("src/web/ai-governance-runtime.ts"),
      source("src/web/ai-governance-actions.ts"),
      source("src/application/ai-provider-configuration-service.ts"),
    ]);
    const combined = files.join("\n");

    expect(combined).not.toContain("getAIAssistanceProviderBinding");
    expect(combined).not.toContain("AIAssistanceService");
    expect(combined).not.toContain(".analyze(");
    expect(combined).not.toContain("fetch(");
  });
});
