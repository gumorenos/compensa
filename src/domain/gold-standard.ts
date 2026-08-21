import { evaluateValuation } from "./scoring-engine.js";
import type { EngineIssue } from "./errors.js";
import type { MethodologyDefinition, ValuationSelections } from "./methodology.js";

export type GoldStandardPartition = "UNASSIGNED" | "CALIBRATION" | "HOLDOUT";
export type GoldStandardCaseStatus = "DRAFT" | "VALIDATED" | "ARCHIVED";
export type GoldStandardSourceType = "APPROVED_VALUATION" | "IMPORT";

export interface GoldStandardJobSnapshot {
  code: string | null;
  name: string;
  department: string | null;
  area: string | null;
  jobFamily: string | null;
}

export interface GoldStandardReference {
  methodology: MethodologyDefinition;
  selections: ValuationSelections;
  expectedPoints: number;
  expectedGradeCode: string;
}

export interface DimensionComparison {
  factorCode: string;
  dimensionCode: string;
  referenceLevelCode: string;
  candidateLevelCode: string | null;
  levelDistance: number | null;
  exactMatch: boolean;
  withinOneLevel: boolean;
}

export interface GoldStandardMetrics {
  dimensionCount: number;
  exactMatchCount: number;
  withinOneLevelCount: number;
  dimensionExactAgreementRate: number;
  dimensionWithinOneLevelRate: number;
  comparableDistanceCount: number;
  meanAbsoluteLevelDistance: number | null;
  maxLevelDistance: number | null;
  referencePoints: number;
  candidatePoints: number;
  pointDelta: number;
  absolutePointDifference: number;
  absolutePointDifferencePercent: number | null;
  referenceGradeCode: string;
  candidateGradeCode: string;
  gradeMatch: boolean;
}

export interface GoldStandardReferenceIssue {
  code: "REFERENCE_SCORE_MISMATCH" | "REFERENCE_GRADE_MISMATCH";
  message: string;
}

export type GoldStandardComparisonResult =
  | {
      status: "SUCCESS";
      metrics: GoldStandardMetrics;
      dimensions: DimensionComparison[];
    }
  | {
      status: "INVALID_REFERENCE";
      errors: Array<EngineIssue | GoldStandardReferenceIssue>;
    }
  | {
      status: "INVALID_CANDIDATE";
      errors: EngineIssue[];
    };

export function compareAgainstGoldStandard(
  reference: GoldStandardReference,
  candidateSelections: ValuationSelections,
): GoldStandardComparisonResult {
  const referenceScoring = evaluateValuation(reference.methodology, reference.selections);
  if (
    referenceScoring.status !== "SUCCESS" ||
    referenceScoring.points === null ||
    referenceScoring.grade === null
  ) {
    return { status: "INVALID_REFERENCE", errors: referenceScoring.errors };
  }

  const referenceIssues: GoldStandardReferenceIssue[] = [];
  if (!numbersEqual(referenceScoring.points, reference.expectedPoints)) {
    referenceIssues.push({
      code: "REFERENCE_SCORE_MISMATCH",
      message: `Reference selections calculate ${referenceScoring.points} points, not ${reference.expectedPoints}.`,
    });
  }
  if (referenceScoring.grade.code !== reference.expectedGradeCode) {
    referenceIssues.push({
      code: "REFERENCE_GRADE_MISMATCH",
      message: `Reference selections calculate grade ${referenceScoring.grade.code}, not ${reference.expectedGradeCode}.`,
    });
  }
  if (referenceIssues.length > 0) {
    return { status: "INVALID_REFERENCE", errors: referenceIssues };
  }

  const candidateScoring = evaluateValuation(reference.methodology, candidateSelections);
  if (
    candidateScoring.status !== "SUCCESS" ||
    candidateScoring.points === null ||
    candidateScoring.grade === null
  ) {
    return { status: "INVALID_CANDIDATE", errors: candidateScoring.errors };
  }

  const dimensions: DimensionComparison[] = [];
  for (const factor of reference.methodology.factors) {
    for (const dimension of factor.dimensions) {
      const referenceLevelCode = reference.selections[dimension.code];
      if (referenceLevelCode === undefined) continue;

      const candidateLevelCode = candidateSelections[dimension.code] ?? null;
      const referenceIndex = dimension.levels.findIndex((level) => level.code === referenceLevelCode);
      const candidateIndex =
        candidateLevelCode === null
          ? -1
          : dimension.levels.findIndex((level) => level.code === candidateLevelCode);
      const levelDistance =
        referenceIndex < 0 || candidateIndex < 0
          ? null
          : Math.abs(candidateIndex - referenceIndex);

      dimensions.push({
        factorCode: factor.code,
        dimensionCode: dimension.code,
        referenceLevelCode,
        candidateLevelCode,
        levelDistance,
        exactMatch: candidateLevelCode === referenceLevelCode,
        withinOneLevel: levelDistance !== null && levelDistance <= 1,
      });
    }
  }

  const exactMatchCount = dimensions.filter((dimension) => dimension.exactMatch).length;
  const withinOneLevelCount = dimensions.filter((dimension) => dimension.withinOneLevel).length;
  const distances = dimensions
    .map((dimension) => dimension.levelDistance)
    .filter((distance): distance is number => distance !== null);
  const absolutePointDifference = Math.abs(candidateScoring.points - reference.expectedPoints);

  return {
    status: "SUCCESS",
    dimensions,
    metrics: {
      dimensionCount: dimensions.length,
      exactMatchCount,
      withinOneLevelCount,
      dimensionExactAgreementRate: rate(exactMatchCount, dimensions.length),
      dimensionWithinOneLevelRate: rate(withinOneLevelCount, dimensions.length),
      comparableDistanceCount: distances.length,
      meanAbsoluteLevelDistance:
        distances.length === 0
          ? null
          : distances.reduce((sum, distance) => sum + distance, 0) / distances.length,
      maxLevelDistance: distances.length === 0 ? null : Math.max(...distances),
      referencePoints: reference.expectedPoints,
      candidatePoints: candidateScoring.points,
      pointDelta: candidateScoring.points - reference.expectedPoints,
      absolutePointDifference,
      absolutePointDifferencePercent:
        reference.expectedPoints === 0
          ? null
          : (absolutePointDifference / Math.abs(reference.expectedPoints)) * 100,
      referenceGradeCode: reference.expectedGradeCode,
      candidateGradeCode: candidateScoring.grade.code,
      gradeMatch: candidateScoring.grade.code === reference.expectedGradeCode,
    },
  };
}

function rate(count: number, total: number): number {
  return total === 0 ? 1 : count / total;
}

function numbersEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9;
}
