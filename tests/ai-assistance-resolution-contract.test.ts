import { describe, expect, it } from "vitest";
import {
  AIAssistanceResolutionValidationError,
  validateAIAssistanceResolutionInput,
} from "../src/ai/resolution.js";

function expectCode(input: unknown, code: string): void {
  try {
    validateAIAssistanceResolutionInput(input);
    throw new Error("Expected validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AIAssistanceResolutionValidationError);
    expect((error as AIAssistanceResolutionValidationError).code).toBe(code);
  }
}

describe("AI suggestion human resolution contract", () => {
  it("accepts an AI suggestion without allowing the caller to choose the accepted level", () => {
    expect(
      validateAIAssistanceResolutionInput({
        resolution: "ACCEPTED",
        note: "Revisado contra el descriptivo",
        justification: "La evidencia sustenta el nivel sugerido.",
      }),
    ).toEqual({
      resolution: "ACCEPTED",
      resolvedLevelCode: null,
      note: "Revisado contra el descriptivo",
      justification: "La evidencia sustenta el nivel sugerido.",
    });

    expectCode(
      { resolution: "ACCEPTED", resolvedLevelCode: "K9" },
      "AI_RESOLUTION_INVALID",
    );
  });

  it("requires an explicit human level for modification", () => {
    expect(
      validateAIAssistanceResolutionInput({
        resolution: "MODIFIED",
        resolvedLevelCode: " K3 ",
        justification: "La entrevista confirma mayor alcance.",
      }),
    ).toEqual({
      resolution: "MODIFIED",
      resolvedLevelCode: "K3",
      note: null,
      justification: "La entrevista confirma mayor alcance.",
    });

    expectCode({ resolution: "MODIFIED" }, "AI_RESOLUTION_INVALID");
  });

  it("keeps rejection non-authoritative: no level and no decision justification", () => {
    expect(
      validateAIAssistanceResolutionInput({ resolution: "REJECTED", note: "No aplica." }),
    ).toEqual({
      resolution: "REJECTED",
      resolvedLevelCode: null,
      note: "No aplica.",
      justification: null,
    });

    expectCode(
      { resolution: "REJECTED", resolvedLevelCode: "K2" },
      "AI_RESOLUTION_INVALID",
    );
    expectCode(
      { resolution: "REJECTED", justification: "Should not become a decision." },
      "AI_RESOLUTION_INVALID",
    );
  });

  it("rejects unknown fields instead of silently expanding the human authority surface", () => {
    expectCode(
      { resolution: "ACCEPTED", points: 999, gradeCode: "G9" },
      "AI_RESOLUTION_UNKNOWN_FIELD",
    );
  });

  it("normalizes optional text and enforces bounded audit text", () => {
    expect(
      validateAIAssistanceResolutionInput({
        resolution: "MODIFIED",
        resolvedLevelCode: "K3",
        note: "   ",
        justification: "   ",
      }),
    ).toMatchObject({ note: null, justification: null });

    expectCode(
      { resolution: "REJECTED", note: "x".repeat(2001) },
      "AI_RESOLUTION_INVALID",
    );
    expectCode(
      {
        resolution: "MODIFIED",
        resolvedLevelCode: "K3",
        justification: "x".repeat(5001),
      },
      "AI_RESOLUTION_INVALID",
    );
  });
});
