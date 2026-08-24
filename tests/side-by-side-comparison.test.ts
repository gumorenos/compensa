import { describe, expect, it } from "vitest";
import type { ApprovedValuationSummary } from "../src/application/comparables-service.js";
import {
  buildSideBySideComparisonReport,
  SideBySideComparisonError,
} from "../src/application/side-by-side-comparison.js";
import {
  demoMethodology,
  demoMidLevelSelections,
} from "../src/fixtures/demo-methodology.js";

function valuation(
  id: string,
  overrides: Partial<ApprovedValuationSummary> = {},
): ApprovedValuationSummary {
  return {
    valuationId: id,
    valuationVersion: 1,
    jobId: `job-${id}`,
    jobCode: id.toUpperCase(),
    jobName: `Puesto ${id}`,
    department: "Operaciones",
    area: "Planeamiento",
    jobFamily: "Operaciones",
    methodologyVersionId: "method-1",
    methodologyCode: demoMethodology.code,
    methodologyName: demoMethodology.name,
    methodologyVersion: demoMethodology.version,
    totalPoints: 231,
    gradeCode: "G3",
    approvedAt: new Date("2026-08-24T00:00:00Z"),
    ...overrides,
  };
}

function decisions(overrides: Record<string, string | null> = {}) {
  const map = new Map<string, string>();
  for (const [dimensionCode, defaultLevel] of Object.entries(demoMidLevelSelections)) {
    const selected = overrides[dimensionCode] ?? defaultLevel;
    if (selected !== null) map.set(dimensionCode, selected);
  }
  return map;
}

describe("side-by-side comparison", () => {
  it("preserves selected column order and summarizes only observable differences", () => {
    const valuations = [
      valuation("third", { totalPoints: 268, gradeCode: "G3" }),
      valuation("first", { totalPoints: 190, gradeCode: "G2" }),
      valuation("second", { totalPoints: 231, gradeCode: "G3" }),
    ];
    const decisionMap = new Map([
      ["third", decisions({ DOMAIN_KNOWLEDGE: "K3" })],
      ["first", decisions({ AUTONOMY: "A1" })],
      ["second", decisions()],
    ]);

    const report = buildSideBySideComparisonReport(demoMethodology, valuations, decisionMap);

    expect(report.valuations.map((item) => item.valuationId)).toEqual(["third", "first", "second"]);
    expect(report).toMatchObject({
      pointMin: 190,
      pointMax: 268,
      pointSpread: 78,
      gradeCodes: ["G3", "G2"],
    });
    expect(report.dimensions.find((row) => row.dimensionCode === "DOMAIN_KNOWLEDGE")).toMatchObject({
      comparison: "DIFFERENT",
    });
    expect(report.dimensions.find((row) => row.dimensionCode === "IMPACT_SCOPE")).toMatchObject({
      comparison: "SAME_LEVEL",
    });
  });

  it("distinguishes all-missing from an actual shared level", () => {
    const report = buildSideBySideComparisonReport(
      demoMethodology,
      [valuation("a"), valuation("b")],
      new Map([
        ["a", decisions({ PEOPLE_SCOPE: null })],
        ["b", decisions({ PEOPLE_SCOPE: null })],
      ]),
    );

    expect(report.dimensions.find((row) => row.dimensionCode === "PEOPLE_SCOPE")?.comparison).toBe("ALL_MISSING");
    expect(report.dimensions.find((row) => row.dimensionCode === "AUTONOMY")?.comparison).toBe("SAME_LEVEL");
  });

  it("rejects fewer than two or more than five valuations", () => {
    expect(() => buildSideBySideComparisonReport(demoMethodology, [valuation("one")], new Map())).toThrowError(
      expect.objectContaining({ code: "INVALID_SELECTION_COUNT" }),
    );
    expect(() => buildSideBySideComparisonReport(
      demoMethodology,
      [1, 2, 3, 4, 5, 6].map((index) => valuation(String(index))),
      new Map(),
    )).toThrowError(expect.objectContaining({ code: "INVALID_SELECTION_COUNT" }));
  });

  it("rejects mixed methodology versions instead of normalizing them", () => {
    expect(() => buildSideBySideComparisonReport(
      demoMethodology,
      [valuation("a"), valuation("b", { methodologyVersionId: "method-2" })],
      new Map(),
    )).toThrowError(expect.objectContaining({ code: "METHODOLOGY_VERSION_MISMATCH" }));
  });

  it("uses an explicit domain error type for comparison request failures", () => {
    try {
      buildSideBySideComparisonReport(demoMethodology, [valuation("one")], new Map());
      throw new Error("Expected comparison error");
    } catch (error) {
      expect(error).toBeInstanceOf(SideBySideComparisonError);
    }
  });
});
