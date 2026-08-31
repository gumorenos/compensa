import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  toProviderMethodologyContext,
  validateAIAssistanceProviderResult,
  type AIAssistanceProviderInput,
} from "../src/ai/contracts.js";
import { LocalFixtureAIAssistanceProvider } from "../src/ai/local-fixture-provider.js";
import { getAIAssistanceProviderBinding } from "../src/ai/provider-binding.js";
import { demoMethodology } from "../src/fixtures/demo-methodology.js";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("application-facing AI assistance workflow contract", () => {
  it("keeps the local fixture explicitly opt-in and default-off", () => {
    expect(getAIAssistanceProviderBinding({})).toBeNull();
    expect(getAIAssistanceProviderBinding({ COMPENSA_AI_FIXTURE_ENABLED: "false" })).toBeNull();
    expect(getAIAssistanceProviderBinding({ COMPENSA_AI_FIXTURE_ENABLED: "TRUE" })).toBeNull();

    const binding = getAIAssistanceProviderBinding({ COMPENSA_AI_FIXTURE_ENABLED: "true" });
    expect(binding).toMatchObject({
      processingMode: "LOCAL",
      testFixture: true,
      promptVersion: "local-fixture-workflow-v1",
    });
  });

  it("produces a valid deterministic fixture result without network calls or fake confidence", async () => {
    const provider = new LocalFixtureAIAssistanceProvider();
    const content =
      "Responsable de análisis financiero y coordinación transversal con varias áreas. " +
      "Trabaja dentro de políticas definidas y documenta sus decisiones.";
    const input: AIAssistanceProviderInput = {
      valuationId: "11111111-1111-4111-8111-111111111111",
      jobDescription: {
        versionId: "22222222-2222-4222-8222-222222222222",
        content,
      },
      methodology: toProviderMethodologyContext(demoMethodology),
    };

    const raw = await provider.analyze(input);
    const validated = validateAIAssistanceProviderResult(raw, demoMethodology, content);

    expect(provider.providerId).toBe("LOCAL_FIXTURE");
    expect(validated.suggestions.length).toBeGreaterThan(0);
    expect(validated.suggestions[0]!.confidence).toBeNull();
    expect(validated.suggestions[0]!.rationale).toContain("No es una recomendación real");
    expect(validated.suggestions.some((item) => item.suggestedLevelCode === null)).toBe(true);

    const providerSource = await source("src/ai/local-fixture-provider.ts");
    expect(providerSource).not.toContain("fetch(");
    expect(providerSource).not.toContain("http://");
    expect(providerSource).not.toContain("https://");
  });

  it("enforces tenant governance and valuation scope before generation and resolution", async () => {
    const workflow = await source("src/application/ai-assistance-workflow-service.ts");
    expect(workflow).toContain("this.requireEnabled(organizationId)");
    expect(workflow).toContain('this.binding.processingMode === "EXTERNAL"');
    expect(workflow).toContain("settings.externalProcessingAllowed");
    expect(workflow).toContain("AIAssistanceService");
    expect(workflow).toContain("AIAssistanceResolutionService");
    expect(workflow).toContain("r.valuation_id = $3");
    expect(workflow).toContain("AI_WORKFLOW_SUGGESTION_NOT_FOUND");
    expect(workflow).not.toContain("evaluateValuation");
    expect(workflow).not.toContain("gold_standard");
    expect(workflow).not.toContain("calibration_");
  });

  it("requires EVALUATE at both mutation boundaries and validates UUID form inputs first", async () => {
    const actions = await source("src/web/ai-assistance-actions.ts");
    expect(actions.match(/getAppContext\("EVALUATE"\)/g)).toHaveLength(2);
    expect(actions).toContain("requiredUuid(formData, \"valuationId\")");
    expect(actions).toContain("requiredUuid(formData, \"suggestionId\")");
    expect(actions).toContain("UUID_PATTERN.test(value)");
  });

  it("keeps the operational UI explicit about human authority and the local test fixture", async () => {
    const page = await source("app/valuations/[valuationId]/ai-assistance/page.tsx");
    const layout = await source("app/valuations/[valuationId]/layout.tsx");

    expect(layout).toContain("/ai-assistance");
    expect(page).toContain("Modo de prueba local.");
    expect(page).toContain("no es recomendación real");
    expect(page).toContain("La persona sigue decidiendo");
    expect(page).toContain("Gold Standard, HOLDOUT y calibración no forman parte de este flujo.");
    expect(page).not.toContain("defaultValue={suggestion.rationale}");
  });
});
