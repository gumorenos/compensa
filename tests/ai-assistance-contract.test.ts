import { describe, expect, it } from "vitest";
import {
  AIAssistanceValidationError,
  toProviderMethodologyContext,
  validateAIAssistanceProviderResult,
} from "../src/ai/contracts.js";
import { demoMethodology } from "../src/fixtures/demo-methodology.js";

const description = `
Responsable de análisis financiero y coordinación con líderes de distintas áreas.
Resuelve problemas de complejidad intermedia con autonomía dentro de políticas definidas.
No tiene personal directo a cargo.
`;

function validPayload(): unknown {
  return {
    suggestions: [
      {
        dimensionCode: "DOMAIN_KNOWLEDGE",
        suggestedLevelCode: "K2",
        confidence: 0.78,
        rationale: "El descriptivo exige conocimiento aplicado y coordinación transversal.",
        evidence: [
          {
            excerpt: "análisis financiero y coordinación con líderes de distintas áreas",
            sourceSection: "Responsabilidades",
          },
        ],
      },
    ],
    clarifications: [
      {
        dimensionCode: "PEOPLE_SCOPE",
        question: "¿Existe liderazgo funcional aunque no haya reportes directos?",
        reason: "El descriptivo solo descarta personal directo.",
      },
    ],
  };
}

function expectValidationCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error("Expected validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AIAssistanceValidationError);
    expect((error as AIAssistanceValidationError).code).toBe(code);
  }
}

describe("AI assistance provider contract", () => {
  it("exposes factors, dimensions and levels but not scoring steps or grades", () => {
    const context = toProviderMethodologyContext(demoMethodology);
    expect(context.code).toBe(demoMethodology.code);
    expect(context.factors).toHaveLength(demoMethodology.factors.length);
    expect(context).not.toHaveProperty("scoring");
    expect(context).not.toHaveProperty("grades");
    expect(JSON.stringify(context)).not.toContain("totalStep");
    expect(JSON.stringify(context)).not.toContain("minPoints");
  });

  it("accepts valid level suggestions, anchored evidence and clarification questions", () => {
    const result = validateAIAssistanceProviderResult(validPayload(), demoMethodology, description);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      dimensionCode: "DOMAIN_KNOWLEDGE",
      suggestedLevelCode: "K2",
      confidence: 0.78,
    });
    expect(result.clarifications[0]?.dimensionCode).toBe("PEOPLE_SCOPE");
  });

  it("allows abstention with a null suggested level instead of inventing a decision", () => {
    const payload = validPayload() as {
      suggestions: Array<Record<string, unknown>>;
      clarifications: unknown[];
    };
    payload.suggestions[0]!.suggestedLevelCode = null;
    payload.suggestions[0]!.confidence = null;
    const result = validateAIAssistanceProviderResult(payload, demoMethodology, description);
    expect(result.suggestions[0]?.suggestedLevelCode).toBeNull();
    expect(result.suggestions[0]?.confidence).toBeNull();
  });

  it("rejects scoring or grade fields instead of silently accepting them", () => {
    const payload = validPayload() as {
      suggestions: Array<Record<string, unknown>>;
    };
    payload.suggestions[0]!.points = 999;
    payload.suggestions[0]!.gradeCode = "G9";
    expectValidationCode(
      () => validateAIAssistanceProviderResult(payload, demoMethodology, description),
      "AI_RESULT_UNKNOWN_FIELD",
    );
  });

  it("rejects duplicate or unknown dimensions", () => {
    const duplicate = validPayload() as { suggestions: unknown[] };
    duplicate.suggestions.push({
      dimensionCode: "DOMAIN_KNOWLEDGE",
      suggestedLevelCode: "K1",
      confidence: 0.2,
      rationale: "Duplicate",
      evidence: [],
    });
    expectValidationCode(
      () => validateAIAssistanceProviderResult(duplicate, demoMethodology, description),
      "AI_DUPLICATE_DIMENSION",
    );

    const unknown = validPayload() as {
      suggestions: Array<Record<string, unknown>>;
    };
    unknown.suggestions[0]!.dimensionCode = "NOT_A_DIMENSION";
    expectValidationCode(
      () => validateAIAssistanceProviderResult(unknown, demoMethodology, description),
      "AI_UNKNOWN_DIMENSION",
    );
  });

  it("rejects levels that do not belong to the referenced dimension", () => {
    const payload = validPayload() as {
      suggestions: Array<Record<string, unknown>>;
    };
    payload.suggestions[0]!.suggestedLevelCode = "P2";
    expectValidationCode(
      () => validateAIAssistanceProviderResult(payload, demoMethodology, description),
      "AI_INVALID_LEVEL",
    );
  });

  it("rejects non-finite or out-of-range confidence", () => {
    for (const confidence of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      const payload = validPayload() as {
        suggestions: Array<Record<string, unknown>>;
      };
      payload.suggestions[0]!.confidence = confidence;
      expectValidationCode(
        () => validateAIAssistanceProviderResult(payload, demoMethodology, description),
        "AI_INVALID_CONFIDENCE",
      );
    }
  });

  it("rejects evidence invented outside the pinned job description", () => {
    const payload = validPayload() as {
      suggestions: Array<{ evidence: Array<Record<string, unknown>> }>;
    };
    payload.suggestions[0]!.evidence[0]!.excerpt = "Administra un equipo regional de 80 personas";
    expectValidationCode(
      () => validateAIAssistanceProviderResult(payload, demoMethodology, description),
      "AI_EVIDENCE_NOT_IN_DESCRIPTION",
    );
  });

  it("rejects an empty result instead of treating silence as a recommendation", () => {
    expectValidationCode(
      () =>
        validateAIAssistanceProviderResult(
          { suggestions: [], clarifications: [] },
          demoMethodology,
          description,
        ),
      "AI_RESULT_EMPTY",
    );
  });
});
