import type { GoldStandardMetrics } from "./gold-standard.js";

export interface CalibrationSummary {
  caseCount: number;
  dimensionCount: number;
  exactDimensionAgreementCount: number;
  exactDimensionAgreementRate: number;
  withinOneLevelCount: number;
  withinOneLevelRate: number;
  gradeMatchCount: number;
  gradeMatchRate: number;
  gradeWithinOneCount: number;
  gradeWithinOneRate: number;
  meanGradeDistance: number;
  maxGradeDistance: number;
  meanSignedPointDelta: number;
  meanAbsolutePointDifference: number;
  meanAbsolutePointDifferencePercent: number | null;
  comparableLevelDistanceCount: number;
  meanAbsoluteLevelDistance: number | null;
  maxLevelDistance: number | null;
  largestAbsolutePointDifference: number;
}

export function aggregateCalibrationMetrics(metrics: readonly GoldStandardMetrics[]): CalibrationSummary {
  if (metrics.length === 0) {
    return {
      caseCount: 0,
      dimensionCount: 0,
      exactDimensionAgreementCount: 0,
      exactDimensionAgreementRate: 1,
      withinOneLevelCount: 0,
      withinOneLevelRate: 1,
      gradeMatchCount: 0,
      gradeMatchRate: 1,
      gradeWithinOneCount: 0,
      gradeWithinOneRate: 1,
      meanGradeDistance: 0,
      maxGradeDistance: 0,
      meanSignedPointDelta: 0,
      meanAbsolutePointDifference: 0,
      meanAbsolutePointDifferencePercent: null,
      comparableLevelDistanceCount: 0,
      meanAbsoluteLevelDistance: null,
      maxLevelDistance: null,
      largestAbsolutePointDifference: 0,
    };
  }

  const caseCount = metrics.length;
  const dimensionCount = metrics.reduce((sum, item) => sum + item.dimensionCount, 0);
  const exactDimensionAgreementCount = metrics.reduce((sum, item) => sum + item.exactMatchCount, 0);
  const withinOneLevelCount = metrics.reduce((sum, item) => sum + item.withinOneLevelCount, 0);
  const gradeMatchCount = metrics.filter((item) => item.gradeMatch).length;
  const gradeWithinOneCount = metrics.filter((item) => item.gradeWithinOne).length;
  const meanGradeDistance = average(metrics.map((item) => item.gradeDistance));
  const maxGradeDistance = Math.max(...metrics.map((item) => item.gradeDistance));
  const meanSignedPointDelta = average(metrics.map((item) => item.pointDelta));
  const meanAbsolutePointDifference = average(metrics.map((item) => item.absolutePointDifference));
  const percentageValues = metrics
    .map((item) => item.absolutePointDifferencePercent)
    .filter((value): value is number => value !== null);
  const comparableLevelDistanceCount = metrics.reduce(
    (sum, item) => sum + item.comparableDistanceCount,
    0,
  );
  const distanceWeightedSum = metrics.reduce((sum, item) => {
    if (item.meanAbsoluteLevelDistance === null) return sum;
    return sum + item.meanAbsoluteLevelDistance * item.comparableDistanceCount;
  }, 0);
  const maxDistances = metrics
    .map((item) => item.maxLevelDistance)
    .filter((value): value is number => value !== null);

  return {
    caseCount,
    dimensionCount,
    exactDimensionAgreementCount,
    exactDimensionAgreementRate: rate(exactDimensionAgreementCount, dimensionCount),
    withinOneLevelCount,
    withinOneLevelRate: rate(withinOneLevelCount, dimensionCount),
    gradeMatchCount,
    gradeMatchRate: rate(gradeMatchCount, caseCount),
    gradeWithinOneCount,
    gradeWithinOneRate: rate(gradeWithinOneCount, caseCount),
    meanGradeDistance,
    maxGradeDistance,
    meanSignedPointDelta,
    meanAbsolutePointDifference,
    meanAbsolutePointDifferencePercent:
      percentageValues.length === 0 ? null : average(percentageValues),
    comparableLevelDistanceCount,
    meanAbsoluteLevelDistance:
      comparableLevelDistanceCount === 0 ? null : distanceWeightedSum / comparableLevelDistanceCount,
    maxLevelDistance: maxDistances.length === 0 ? null : Math.max(...maxDistances),
    largestAbsolutePointDifference: Math.max(...metrics.map((item) => item.absolutePointDifference)),
  };
}

export function orderCalibrationDeviations<T extends { metrics: GoldStandardMetrics }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => {
    if (left.metrics.gradeMatch !== right.metrics.gradeMatch) {
      return left.metrics.gradeMatch ? 1 : -1;
    }
    if (left.metrics.gradeDistance !== right.metrics.gradeDistance) {
      return right.metrics.gradeDistance - left.metrics.gradeDistance;
    }
    const pointDifference = right.metrics.absolutePointDifference - left.metrics.absolutePointDifference;
    if (pointDifference !== 0) return pointDifference;
    const leftDistance = left.metrics.maxLevelDistance ?? -1;
    const rightDistance = right.metrics.maxLevelDistance ?? -1;
    return rightDistance - leftDistance;
  });
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(count: number, total: number): number {
  return total === 0 ? 1 : count / total;
}
