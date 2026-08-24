import { describe, expect, it } from "vitest";
import { aggregateCalibrationMetrics, orderCalibrationDeviations } from "../src/domain/calibration.js";
import type { GoldStandardMetrics } from "../src/domain/gold-standard.js";

function metric(overrides: Partial<GoldStandardMetrics> = {}): GoldStandardMetrics {
  return {
    dimensionCount: 6,
    exactMatchCount: 6,
    withinOneLevelCount: 6,
    dimensionExactAgreementRate: 1,
    dimensionWithinOneLevelRate: 1,
    comparableDistanceCount: 6,
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
    ...overrides,
  };
}

describe("calibration metric aggregation", () => {
  it("aggregates dimensions by count instead of averaging case percentages", () => {
    const summary = aggregateCalibrationMetrics([
      metric({ dimensionCount: 2, exactMatchCount: 2, withinOneLevelCount: 2 }),
      metric({
        dimensionCount: 8,
        exactMatchCount: 4,
        withinOneLevelCount: 6,
        gradeMatch: false,
        candidateGradeCode: "G4",
        pointDelta: 20,
        absolutePointDifference: 20,
        absolutePointDifferencePercent: 10,
        comparableDistanceCount: 8,
        meanAbsoluteLevelDistance: 0.75,
        maxLevelDistance: 2,
      }),
    ]);

    expect(summary.caseCount).toBe(2);
    expect(summary.dimensionCount).toBe(10);
    expect(summary.exactDimensionAgreementRate).toBeCloseTo(0.6);
    expect(summary.withinOneLevelRate).toBeCloseTo(0.8);
    expect(summary.gradeMatchRate).toBeCloseTo(0.5);
    expect(summary.meanSignedPointDelta).toBeCloseTo(10);
    expect(summary.meanAbsolutePointDifference).toBeCloseTo(10);
    expect(summary.meanAbsolutePointDifferencePercent).toBeCloseTo(5);
    expect(summary.meanAbsoluteLevelDistance).toBeCloseTo(0.6);
    expect(summary.maxLevelDistance).toBe(2);
    expect(summary.largestAbsolutePointDifference).toBe(20);
  });

  it("does not invent percentages when point percentage or level distance is undefined", () => {
    const summary = aggregateCalibrationMetrics([
      metric({
        referencePoints: 0,
        candidatePoints: 0,
        absolutePointDifferencePercent: null,
        comparableDistanceCount: 0,
        meanAbsoluteLevelDistance: null,
        maxLevelDistance: null,
      }),
    ]);
    expect(summary.meanAbsolutePointDifferencePercent).toBeNull();
    expect(summary.meanAbsoluteLevelDistance).toBeNull();
    expect(summary.maxLevelDistance).toBeNull();
  });

  it("orders grade mismatches before same-grade point deviations", () => {
    const exact = { id: "exact", metrics: metric({ absolutePointDifference: 50 }) };
    const mismatch = {
      id: "mismatch",
      metrics: metric({ gradeMatch: false, candidateGradeCode: "G4", absolutePointDifference: 5 }),
    };
    expect(orderCalibrationDeviations([exact, mismatch]).map((item) => item.id)).toEqual([
      "mismatch",
      "exact",
    ]);
  });
});
