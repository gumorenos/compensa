import { describe, expect, it } from "vitest";
import { evaluateValuation, validateMethodology } from "../src/domain/scoring-engine.js";
import { lookupKey, type MethodologyDefinition } from "../src/domain/methodology.js";
import { demoMethodology, demoMidLevelSelections } from "../src/fixtures/demo-methodology.js";

function cloneMethodology(): MethodologyDefinition {
  return structuredClone(demoMethodology);
}

function errorCodes(result: ReturnType<typeof evaluateValuation>): string[] {
  return result.errors.map((error) => error.code);
}

describe("deterministic scoring engine", () => {
  it("calculates points, grade and a complete trace", () => {
    const result = evaluateValuation(demoMethodology, demoMidLevelSelections);

    expect(result.status).toBe("SUCCESS");
    expect(result.points).toBe(231);
    expect(result.grade?.code).toBe("G3");
    expect(result.errors).toEqual([]);
    expect(result.trace).toHaveLength(7);
    expect(result.trace.map((step) => step.type)).toEqual([
      "lookup",
      "lookup",
      "lookup",
      "sum",
      "divide",
      "multiply",
      "round",
    ]);
    expect(result.trace.at(-1)?.output).toBe(231);
  });

  it("returns exactly the same result for the same configuration and selections", () => {
    const first = evaluateValuation(demoMethodology, demoMidLevelSelections);
    const second = evaluateValuation(demoMethodology, demoMidLevelSelections);

    expect(second).toEqual(first);
  });

  it("fails when a required dimension has no selection", () => {
    const selections = { ...demoMidLevelSelections } as Record<string, string>;
    delete selections.AUTONOMY;

    const result = evaluateValuation(demoMethodology, selections);

    expect(result.status).toBe("ERROR");
    expect(errorCodes(result)).toContain("MISSING_REQUIRED_SELECTION");
    expect(result.points).toBeNull();
  });

  it("fails when a selected level does not belong to its dimension", () => {
    const result = evaluateValuation(demoMethodology, {
      ...demoMidLevelSelections,
      AUTONOMY: "NOT_A_LEVEL",
    });

    expect(result.status).toBe("ERROR");
    expect(errorCodes(result)).toContain("INVALID_LEVEL_SELECTION");
  });

  it("fails explicitly when a lookup combination is not configured", () => {
    const methodology = cloneMethodology();
    const knowledgeStep = methodology.scoring.steps.find((step) => step.code === "KNOWLEDGE_SCORE");
    if (knowledgeStep === undefined || knowledgeStep.type !== "lookup") {
      throw new Error("Fixture invariant failed: KNOWLEDGE_SCORE lookup not found");
    }
    delete knowledgeStep.table[lookupKey("K2", "B2")];

    const result = evaluateValuation(methodology, demoMidLevelSelections);

    expect(result.status).toBe("ERROR");
    expect(errorCodes(result)).toContain("LOOKUP_KEY_NOT_FOUND");
    expect(result.trace).toHaveLength(0);
  });

  it("rejects overlapping grade ranges before calculation", () => {
    const methodology = cloneMethodology();
    const grade2 = methodology.grades.find((grade) => grade.code === "G2");
    if (grade2 === undefined) throw new Error("Fixture invariant failed: G2 not found");
    grade2.minPoints = 100;

    const errors = validateMethodology(methodology);

    expect(errors.map((error) => error.code)).toContain("OVERLAPPING_GRADE_RANGES");
  });

  it("rejects references to scoring steps that are not defined earlier", () => {
    const methodology = cloneMethodology();
    const rawTotal = methodology.scoring.steps.find((step) => step.code === "RAW_TOTAL");
    if (rawTotal === undefined || rawTotal.type !== "sum") {
      throw new Error("Fixture invariant failed: RAW_TOTAL sum not found");
    }
    rawTotal.operands = [{ kind: "step", step: "FINAL_TOTAL" }];

    const errors = validateMethodology(methodology);

    expect(errors.map((error) => error.code)).toContain("INVALID_STEP_REFERENCE");
  });

  it("fails explicitly on division by zero", () => {
    const methodology = cloneMethodology();
    const baseIndex = methodology.scoring.steps.find((step) => step.code === "BASE_INDEX");
    if (baseIndex === undefined || baseIndex.type !== "divide") {
      throw new Error("Fixture invariant failed: BASE_INDEX divide not found");
    }
    baseIndex.denominator = { kind: "constant", value: 0 };

    const result = evaluateValuation(methodology, demoMidLevelSelections);

    expect(result.status).toBe("ERROR");
    expect(errorCodes(result)).toContain("DIVISION_BY_ZERO");
    expect(result.trace.map((step) => step.code)).toEqual([
      "KNOWLEDGE_SCORE",
      "PROBLEM_SCORE",
      "IMPACT_SCORE",
      "RAW_TOTAL",
    ]);
  });

  it("fails if the final score does not fit any configured grade", () => {
    const methodology = cloneMethodology();
    methodology.grades = methodology.grades.filter((grade) => grade.maxPoints <= 200);

    const result = evaluateValuation(methodology, demoMidLevelSelections);

    expect(result.status).toBe("ERROR");
    expect(result.points).toBe(231);
    expect(errorCodes(result)).toContain("NO_GRADE_MATCH");
  });
});
