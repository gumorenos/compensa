import { describe, expect, it } from "vitest";
import { previewMethodologyImport } from "../src/application/methodology-import.js";
import { roleHasPermission } from "../src/auth/access.js";
import { demoMethodology } from "../src/fixtures/demo-methodology.js";

function methodology() {
  return structuredClone(demoMethodology);
}

describe("methodology administration", () => {
  it("accepts the declarative demo shape without executing arbitrary code", () => {
    const input = methodology();
    input.code = "ACME_POINT_FACTOR";
    input.name = "ACME Point Factor";
    input.version = "1.0";

    const preview = previewMethodologyImport(input);
    expect(preview.status).toBe("VALID");
    expect(preview.definition?.code).toBe("ACME_POINT_FACTOR");
    expect(preview.factorCount).toBe(3);
    expect(preview.dimensionCount).toBe(6);
    expect(preview.gradeCount).toBe(5);
    expect(preview.scoringStepCount).toBe(7);
  });

  it("rejects malformed documents before domain validation", () => {
    const preview = previewMethodologyImport({
      code: "BROKEN",
      name: "Broken",
      version: "1",
      factors: "not-an-array",
      scoring: {},
      grades: [],
    });

    expect(preview.status).toBe("INVALID");
    expect(preview.definition).toBeNull();
    expect(preview.issues[0]).toMatchObject({
      code: "INVALID_METHODOLOGY_DOCUMENT",
      path: "$.factors",
    });
  });

  it("rejects unsupported scoring step types", () => {
    const input = methodology() as unknown as Record<string, unknown>;
    const scoring = input.scoring as { steps: Array<Record<string, unknown>> };
    scoring.steps[0] = { code: "EXEC", type: "javascript", source: "return 999" };

    const preview = previewMethodologyImport(input);
    expect(preview.status).toBe("INVALID");
    expect(preview.issues[0]).toMatchObject({ code: "INVALID_METHODOLOGY_DOCUMENT" });
    expect(preview.issues[0]?.message).toContain("lookup, sum, multiply, divide or round");
  });

  it("surfaces semantic engine validation such as overlapping grade ranges", () => {
    const input = methodology();
    input.grades[1]!.minPoints = input.grades[0]!.maxPoints;

    const preview = previewMethodologyImport(input);
    expect(preview.status).toBe("INVALID");
    expect(preview.issues.map((issue) => issue.code)).toContain("OVERLAPPING_GRADE_RANGES");
  });

  it("allows only ADMIN to manage methodology definitions", () => {
    expect(roleHasPermission("ADMIN", "MANAGE_METHODOLOGIES")).toBe(true);
    expect(roleHasPermission("EVALUATOR", "MANAGE_METHODOLOGIES")).toBe(false);
    expect(roleHasPermission("REVIEWER", "MANAGE_METHODOLOGIES")).toBe(false);
  });
});
