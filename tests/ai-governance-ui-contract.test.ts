import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { roleHasPermission } from "../src/auth/access.js";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("AI tenant governance UI contract", () => {
  it("requires the dedicated ADMIN permission for both read and write boundaries", async () => {
    const runtime = await source("src/web/ai-governance-runtime.ts");
    const action = await source("src/web/ai-governance-actions.ts");

    expect(runtime).toContain('getAppContext("MANAGE_AI_ASSISTANCE")');
    expect(action).toContain('getAppContext("MANAGE_AI_ASSISTANCE")');
    expect(roleHasPermission("ADMIN", "MANAGE_AI_ASSISTANCE")).toBe(true);
    expect(roleHasPermission("EVALUATOR", "MANAGE_AI_ASSISTANCE")).toBe(false);
    expect(roleHasPermission("REVIEWER", "MANAGE_AI_ASSISTANCE")).toBe(false);
  });

  it("states that opt-in does not bind or invoke an external provider", async () => {
    const page = await source("app/ai-assistance/page.tsx");
    expect(page).toContain("No hay un proveedor externo conectado.");
    expect(page).toContain("no envía descriptivos, valoraciones ni evidencia fuera de");
    expect(page).toContain("no habilita tráfico por sí misma");
  });

  it("keeps provider invocation and deterministic scoring outside the governance surface", async () => {
    const files = await Promise.all([
      source("app/ai-assistance/page.tsx"),
      source("src/web/ai-governance-runtime.ts"),
      source("src/web/ai-governance-actions.ts"),
      source("src/application/ai-governance-service.ts"),
    ]);
    const combined = files.join("\n");

    expect(combined).not.toContain("AIAssistanceProvider");
    expect(combined).not.toContain("AIAssistanceService");
    expect(combined).not.toContain("evaluateValuation");
    expect(combined).not.toContain("valuation_decisions");
    expect(combined).not.toContain("gold_standard");
    expect(combined).not.toContain("calibration_");
  });

  it("revokes external-processing consent when assistance is disabled", async () => {
    const action = await source("src/web/ai-governance-actions.ts");
    expect(action).toContain("assistanceEnabled && formData.get(\"externalProcessingAllowed\") === \"yes\"");
  });
});
