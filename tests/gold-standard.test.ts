import { describe, expect, it } from "vitest";
import { compareAgainstGoldStandard } from "../src/domain/gold-standard.js";
import {
  demoMethodology,
  demoMidLevelSelections,
} from "../src/fixtures/demo-methodology.js";

const reference = {
  methodology: demoMethodology,
  selections: demoMidLevelSelections,
  expectedPoints: 231,
  expectedGradeCode: "G3",
} as const;

describe("Gold Standard comparison", () => {
  it("reports perfect agreement for identical expert and candidate selections", () => {
    const result = compareAgainstGoldStandard(reference, demoMidLevelSelections);

    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") return;

    expect(result.metrics).toMatchObject({
      dimensionCount: 6,
      exactMatchCount: 6,
      withinOneLevelCount: 6,
      dimensionExactAgreementRate: 1,
      dimensionWithinOneLevelRate: 1,
      meanAbsoluteLevelDistance: 0,
      maxLevelDistance: 0,
      referencePoints: 231,
      candidatePoints: 231,
      pointDelta: 0,
      absolutePointDifference: 0,
      absolutePointDifferencePercent: 0,
      referenceGradeCode: "G3",
      candidateGradeCode: "G3",
      gradeMatch: true,
      gradeDistance: 0,
      gradeWithinOne: true,
    });
  });

  it("measures a one-level deviation without conflating it with a grade change", () => {
    const result = compareAgainstGoldStandard(reference, {
      ...demoMidLevelSelections,
      AUTONOMY: "A3",
    });

    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") return;

    expect(result.metrics.exactMatchCount).toBe(5);
    expect(result.metrics.dimensionExactAgreementRate).toBeCloseTo(5 / 6);
    expect(result.metrics.dimensionWithinOneLevelRate).toBe(1);
    expect(result.metrics.meanAbsoluteLevelDistance).toBeCloseTo(1 / 6);
    expect(result.metrics.maxLevelDistance).toBe(1);
    expect(result.metrics.candidatePoints).toBe(252);
    expect(result.metrics.pointDelta).toBe(21);
    expect(result.metrics.absolutePointDifference).toBe(21);
    expect(result.metrics.gradeMatch).toBe(true);
    expect(result.metrics.gradeDistance).toBe(0);
    expect(result.metrics.gradeWithinOne).toBe(true);

    expect(result.dimensions.find((item) => item.dimensionCode === "AUTONOMY"))
      .toMatchObject({
        referenceLevelCode: "A2",
        candidateLevelCode: "A3",
        levelDistance: 1,
        exactMatch: false,
        withinOneLevel: true,
      });
  });

  it("measures grade adjacency using point-range order", () => {
    const result = compareAgainstGoldStandard(reference, {
      ...demoMidLevelSelections,
      DOMAIN_KNOWLEDGE: "K3",
      KNOWLEDGE_BREADTH: "B3",
      PROBLEM_COMPLEXITY: "C3",
      AUTONOMY: "A3",
      IMPACT_SCOPE: "S3",
      PEOPLE_SCOPE: "P2",
    });

    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") return;
    expect(result.metrics.candidateGradeCode).not.toBe(result.metrics.referenceGradeCode);
    expect(result.metrics.gradeDistance).toBeGreaterThan(0);
    expect(result.metrics.gradeWithinOne).toBe(result.metrics.gradeDistance <= 1);
  });

  it("rejects an invalid candidate instead of manufacturing comparison metrics", () => {
    const result = compareAgainstGoldStandard(reference, {
      ...demoMidLevelSelections,
      AUTONOMY: "A9",
    });

    expect(result.status).toBe("INVALID_CANDIDATE");
    if (result.status !== "INVALID_CANDIDATE") return;
    expect(result.errors.map((error) => error.code)).toContain("INVALID_LEVEL_SELECTION");
  });

  it("rejects a reference whose stored expert result no longer reproduces", () => {
    const result = compareAgainstGoldStandard(
      { ...reference, expectedPoints: 999 },
      demoMidLevelSelections,
    );

    expect(result.status).toBe("INVALID_REFERENCE");
    if (result.status !== "INVALID_REFERENCE") return;
    expect(result.errors.map((error) => error.code)).toContain("REFERENCE_SCORE_MISMATCH");
  });
});
