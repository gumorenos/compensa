import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createLocalFixtureAssistanceProvider,
  readLocalFixtureAssistanceConfig,
} from "../src/ai/local-fixture-provider.js";
import { runAIAssistanceWorkflow } from "../src/application/ai-assistance-workflow.js";
import { demoMethodology } from "../src/fixtures/demo-methodology.js";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("application-facing AI assistance workflow contract", () => {
  it("keeps the local fixture explicitly opt-in and default-off", () => {
    expect(readLocalFixtureAssistanceConfig({})).toEqual({ enabled: false });
    expect(readLocalFixtureAssistanceConfig({ COMPENSA_AI_FIXTURE_ENABLED: "false" })).toEqual({ enabled: false });
    expect(readLocalFixtureAssistanceConfig({ COMPENSA_AI_FIXTURE_ENABLED: "true" })).toEqual({ enabled: true });
  });

  it("produces a valid deterministic fixture result without network calls or fake confidence", async () => {
    const provider = createLocalFixtureAssistanceProvider();
    const input = {
      valuationId: "00000000-0000-4000-8000-000000000001",
      jobDescriptionVersionId: "00000000-0000-4000-8000-000000000002",
      descriptionText:
        "Responsable de coordinar actividades, resolver incidencias variables y documentar decisiones del proceso.",
      methodology: demoMethodology,
    };

    const first = await provider.generate(input);
    const second = await provider.generate(input);
    expect(first).toEqual(second);
    expect(first.providerId).toBe("LOCAL_FIXTURE");
    expect(first.modelId).toBe("DETERMINISTIC_V1");
    expect(first.sourceKind).toBe("LOCAL_FIXTURE");
    expect(first.suggestions.length).toBeGreaterThan(0);
    expect(first.suggestions.some((suggestion) => suggestion.suggestedLevelCode === null)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/confidence/i);
  });

  it("enforces tenant governance and valuation scope before generation and resolution", async () => {
    const workflow = await source("src/application/ai-assistance-workflow.ts");
    expect(workflow).toContain("assertAssistanceEnabled");
    expect(workflow).toContain("getValuationSnapshot");
    expect(workflow).toContain("jobDescriptionVersionId");
    expect(workflow).toContain("assertSuggestionBelongsToValuation");
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

  it("keeps the operational UI explicit about prerequisites, human authority and the local test fixture", async () => {
    const page = await source("app/valuations/[valuationId]/ai-assistance/page.tsx");
    const runtime = await source("src/web/ai-assistance-runtime.ts");
    const layout = await source("app/valuations/[valuationId]/layout.tsx");
    const tabs = await source("app/valuations/[valuationId]/valuation-tabs.tsx");

    expect(layout).toContain("<ValuationTabs valuationId={valuationId} />");
    expect(tabs).toContain("/ai-assistance");
    expect(runtime).toContain("hasPinnedDescription: snapshot.valuation.jobDescriptionVersionId !== null");
    expect(page).toContain("data.hasPinnedDescription &&");
    expect(page).toContain("Esta valoración no tiene un descriptivo anclado.");
    expect(page).toContain("Modo de prueba local.");
    expect(page).toContain("no es recomendación real");
    expect(page).toContain("La persona sigue decidiendo");
    expect(page).toContain("Gold Standard, HOLDOUT y calibración no forman parte de este flujo.");
    expect(page).not.toContain("defaultValue={suggestion.rationale}");
  });
});
