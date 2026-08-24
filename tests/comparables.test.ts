import { describe, expect, it } from "vitest";
import {
  buildInternalComparablesReport,
  type ComparableSnapshot,
} from "../src/application/comparables-service.js";
import {
  demoMethodology,
  demoMidLevelSelections,
} from "../src/fixtures/demo-methodology.js";

function snapshot(
  id: string,
  overrides: Partial<ComparableSnapshot> = {},
): ComparableSnapshot {
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
    decisions: new Map(Object.entries(demoMidLevelSelections)),
    ...overrides,
  };
}

describe("internal comparables", () => {
  it("reports transparent point, grade and dimension differences", () => {
    const base = snapshot("base");
    const changedDecisions = new Map(base.decisions);
    changedDecisions.set("DOMAIN_KNOWLEDGE", "K3");

    const report = buildInternalComparablesReport(demoMethodology, base, [
      snapshot("candidate", {
        totalPoints: 255,
        gradeCode: "G3",
        decisions: changedDecisions,
      }),
    ]);

    expect(report.comparableCount).toBe(1);
    expect(report.candidates[0]).toMatchObject({
      pointDifference: 24,
      absolutePointDifference: 24,
      gradeDistance: 0,
      absoluteGradeDistance: 0,
      comparedDimensions: 6,
      exactDimensionMatches: 5,
      totalLevelDistance: 1,
      sameJob: false,
      sameJobFamily: true,
      sameDepartment: true,
    });
    expect(report.candidates[0]?.dimensionDifferences).toEqual([
      expect.objectContaining({
        factorCode: "KNOWLEDGE",
        dimensionCode: "DOMAIN_KNOWLEDGE",
        baseLevelCode: "K2",
        candidateLevelCode: "K3",
        levelDistance: 1,
      }),
    ]);
  });

  it("orders lexicographically by grade distance, points and then level distance", () => {
    const base = snapshot("base");
    const fartherLevels = new Map(base.decisions);
    fartherLevels.set("DOMAIN_KNOWLEDGE", "K3");
    fartherLevels.set("AUTONOMY", "A3");

    const report = buildInternalComparablesReport(demoMethodology, base, [
      snapshot("different-grade", { totalPoints: 232, gradeCode: "G4" }),
      snapshot("same-grade-more-points", { totalPoints: 250, decisions: base.decisions }),
      snapshot("same-grade-near", { totalPoints: 240, decisions: fartherLevels }),
      snapshot("same-grade-same-points-farther-levels", {
        totalPoints: 240,
        decisions: new Map([
          ...base.decisions,
          ["DOMAIN_KNOWLEDGE", "K3"],
          ["KNOWLEDGE_BREADTH", "B3"],
          ["AUTONOMY", "A3"],
        ]),
      }),
    ]);

    expect(report.candidates.map((candidate) => candidate.valuationId)).toEqual([
      "same-grade-near",
      "same-grade-same-points-farther-levels",
      "same-grade-more-points",
      "different-grade",
    ]);
  });

  it("derives ordinal grade distance by point ranges rather than JSON array order", () => {
    const unorderedMethodology = {
      ...demoMethodology,
      grades: [...demoMethodology.grades].reverse(),
    };
    const report = buildInternalComparablesReport(unorderedMethodology, snapshot("base"), [
      snapshot("higher-grade", { gradeCode: "G4", totalPoints: 300 }),
      snapshot("lower-grade", { gradeCode: "G2", totalPoints: 190 }),
    ]);

    expect(report.candidates.find((candidate) => candidate.valuationId === "higher-grade")?.gradeDistance).toBe(1);
    expect(report.candidates.find((candidate) => candidate.valuationId === "lower-grade")?.gradeDistance).toBe(-1);
  });

  it("excludes valuations from another methodology version", () => {
    const report = buildInternalComparablesReport(demoMethodology, snapshot("base"), [
      snapshot("same-method"),
      snapshot("other-method", { methodologyVersionId: "method-2" }),
    ]);

    expect(report.candidates.map((candidate) => candidate.valuationId)).toEqual(["same-method"]);
  });

  it("marks same-job history, rejects blank metadata matches and never guesses unknown grades", () => {
    const base = snapshot("base", {
      jobId: "job-shared",
      jobFamily: " ",
      department: "",
    });
    const report = buildInternalComparablesReport(demoMethodology, base, [
      snapshot("history", {
        jobId: "job-shared",
        valuationVersion: 2,
        gradeCode: "UNKNOWN",
        jobFamily: "",
        department: " ",
      }),
    ]);

    expect(report.candidates[0]).toMatchObject({
      sameJob: true,
      sameJobFamily: false,
      sameDepartment: false,
      gradeDistance: null,
      absoluteGradeDistance: null,
    });
  });
});
