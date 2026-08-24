import type { Pool } from "pg";
import type { MethodologyDefinition } from "../domain/methodology.js";

export interface ApprovedValuationSummary {
  valuationId: string;
  valuationVersion: number;
  jobId: string;
  jobCode: string | null;
  jobName: string;
  department: string | null;
  area: string | null;
  jobFamily: string | null;
  methodologyVersionId: string;
  methodologyCode: string;
  methodologyName: string;
  methodologyVersion: string;
  totalPoints: number;
  gradeCode: string;
  approvedAt: Date | null;
}

export interface ComparableDimensionDifference {
  factorCode: string;
  factorName: string;
  dimensionCode: string;
  dimensionName: string;
  baseLevelCode: string;
  baseLevelLabel: string;
  candidateLevelCode: string;
  candidateLevelLabel: string;
  levelDistance: number | null;
}

export interface InternalComparable extends ApprovedValuationSummary {
  pointDifference: number;
  absolutePointDifference: number;
  gradeDistance: number | null;
  absoluteGradeDistance: number | null;
  comparedDimensions: number;
  exactDimensionMatches: number;
  totalLevelDistance: number;
  sameJob: boolean;
  sameJobFamily: boolean;
  sameDepartment: boolean;
  dimensionDifferences: ComparableDimensionDifference[];
}

export interface InternalComparablesReport {
  base: ApprovedValuationSummary;
  comparableCount: number;
  candidates: InternalComparable[];
}

interface ApprovedValuationRow {
  valuation_id: string;
  valuation_version: number;
  job_id: string;
  job_code: string | null;
  job_name: string;
  department: string | null;
  area: string | null;
  job_family: string | null;
  methodology_version_id: string;
  methodology_code: string;
  methodology_name: string;
  methodology_version: string;
  methodology_definition: MethodologyDefinition;
  total_points: string | number;
  grade_code: string;
  approved_at: Date | null;
}

interface DecisionRow {
  valuation_id: string;
  dimension_code: string;
  selected_level_code: string;
}

export interface ComparableSnapshot extends ApprovedValuationSummary {
  decisions: ReadonlyMap<string, string>;
}

export class InternalComparablesService {
  constructor(private readonly pool: Pool) {}

  async listApprovedValuations(organizationId: string): Promise<ApprovedValuationSummary[]> {
    const rows = await this.loadApprovedRows(organizationId);
    return rows.map(summaryFromRow);
  }

  async getReport(
    organizationId: string,
    baseValuationId: string,
  ): Promise<InternalComparablesReport | null> {
    const rows = await this.loadApprovedRows(organizationId);
    const baseRow = rows.find((row) => row.valuation_id === baseValuationId);
    if (baseRow === undefined) return null;

    const candidateRows = rows.filter(
      (row) =>
        row.valuation_id !== baseValuationId &&
        row.methodology_version_id === baseRow.methodology_version_id,
    );
    const valuationIds = [baseValuationId, ...candidateRows.map((row) => row.valuation_id)];
    const decisionsByValuation = await this.loadDecisions(organizationId, valuationIds);

    const base: ComparableSnapshot = {
      ...summaryFromRow(baseRow),
      decisions: decisionsByValuation.get(baseValuationId) ?? new Map(),
    };
    const candidates = candidateRows.map((row) => ({
      ...summaryFromRow(row),
      decisions: decisionsByValuation.get(row.valuation_id) ?? new Map(),
    }));

    return buildInternalComparablesReport(baseRow.methodology_definition, base, candidates);
  }

  private async loadApprovedRows(organizationId: string): Promise<ApprovedValuationRow[]> {
    const result = await this.pool.query(
      `SELECT
         v.id AS valuation_id,
         v.version AS valuation_version,
         v.job_id,
         j.code AS job_code,
         j.name AS job_name,
         j.department,
         j.area,
         j.job_family,
         v.methodology_version_id,
         m.code AS methodology_code,
         m.name AS methodology_name,
         m.version AS methodology_version,
         m.definition AS methodology_definition,
         v.total_points,
         v.grade_code,
         approved.created_at AS approved_at
       FROM valuations v
       JOIN jobs j
         ON j.id = v.job_id
        AND j.organization_id = v.organization_id
       JOIN methodology_versions m
         ON m.id = v.methodology_version_id
       LEFT JOIN LATERAL (
         SELECT created_at
         FROM valuation_review_actions r
         WHERE r.organization_id = v.organization_id
           AND r.valuation_id = v.id
           AND r.action = 'APPROVED'
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT 1
       ) approved ON true
       WHERE v.organization_id = $1
         AND v.status = 'APPROVED'
         AND v.total_points IS NOT NULL
         AND v.grade_code IS NOT NULL
       ORDER BY approved.created_at DESC NULLS LAST, j.name, v.version DESC`,
      [organizationId],
    );
    return result.rows as ApprovedValuationRow[];
  }

  private async loadDecisions(
    organizationId: string,
    valuationIds: readonly string[],
  ): Promise<Map<string, Map<string, string>>> {
    if (valuationIds.length === 0) return new Map();
    const result = await this.pool.query(
      `SELECT valuation_id, dimension_code, selected_level_code
       FROM valuation_decisions
       WHERE organization_id = $1
         AND valuation_id = ANY($2::uuid[])
       ORDER BY valuation_id, dimension_code`,
      [organizationId, valuationIds],
    );
    const grouped = new Map<string, Map<string, string>>();
    for (const row of result.rows as DecisionRow[]) {
      const decisions = grouped.get(row.valuation_id) ?? new Map<string, string>();
      decisions.set(row.dimension_code, row.selected_level_code);
      grouped.set(row.valuation_id, decisions);
    }
    return grouped;
  }
}

export function buildInternalComparablesReport(
  methodology: MethodologyDefinition,
  base: ComparableSnapshot,
  candidates: readonly ComparableSnapshot[],
): InternalComparablesReport {
  const gradeIndexes = new Map(methodology.grades.map((grade, index) => [grade.code, index]));
  const dimensionDefinitions = methodology.factors.flatMap((factor) =>
    factor.dimensions.map((dimension) => ({ factor, dimension })),
  );

  const comparableCandidates = candidates
    .filter((candidate) => candidate.methodologyVersionId === base.methodologyVersionId)
    .map((candidate): InternalComparable => {
      const baseGradeIndex = gradeIndexes.get(base.gradeCode);
      const candidateGradeIndex = gradeIndexes.get(candidate.gradeCode);
      const gradeDistance =
        baseGradeIndex === undefined || candidateGradeIndex === undefined
          ? null
          : candidateGradeIndex - baseGradeIndex;

      let comparedDimensions = 0;
      let exactDimensionMatches = 0;
      let totalLevelDistance = 0;
      const dimensionDifferences: ComparableDimensionDifference[] = [];

      for (const { factor, dimension } of dimensionDefinitions) {
        const baseLevelCode = base.decisions.get(dimension.code);
        const candidateLevelCode = candidate.decisions.get(dimension.code);
        if (baseLevelCode === undefined || candidateLevelCode === undefined) continue;
        comparedDimensions += 1;
        if (baseLevelCode === candidateLevelCode) {
          exactDimensionMatches += 1;
          continue;
        }

        const baseIndex = dimension.levels.findIndex((level) => level.code === baseLevelCode);
        const candidateIndex = dimension.levels.findIndex((level) => level.code === candidateLevelCode);
        const levelDistance =
          baseIndex < 0 || candidateIndex < 0 ? null : Math.abs(candidateIndex - baseIndex);
        if (levelDistance !== null) totalLevelDistance += levelDistance;

        dimensionDifferences.push({
          factorCode: factor.code,
          factorName: factor.name,
          dimensionCode: dimension.code,
          dimensionName: dimension.name,
          baseLevelCode,
          baseLevelLabel: levelLabel(dimension.levels, baseLevelCode),
          candidateLevelCode,
          candidateLevelLabel: levelLabel(dimension.levels, candidateLevelCode),
          levelDistance,
        });
      }

      const pointDifference = candidate.totalPoints - base.totalPoints;
      return {
        ...summaryOnly(candidate),
        pointDifference,
        absolutePointDifference: Math.abs(pointDifference),
        gradeDistance,
        absoluteGradeDistance: gradeDistance === null ? null : Math.abs(gradeDistance),
        comparedDimensions,
        exactDimensionMatches,
        totalLevelDistance,
        sameJob: candidate.jobId === base.jobId,
        sameJobFamily: sameNormalized(candidate.jobFamily, base.jobFamily),
        sameDepartment: sameNormalized(candidate.department, base.department),
        dimensionDifferences,
      };
    })
    .sort(compareCandidates);

  return {
    base: summaryOnly(base),
    comparableCount: comparableCandidates.length,
    candidates: comparableCandidates,
  };
}

function compareCandidates(left: InternalComparable, right: InternalComparable): number {
  const leftGrade = left.absoluteGradeDistance ?? Number.POSITIVE_INFINITY;
  const rightGrade = right.absoluteGradeDistance ?? Number.POSITIVE_INFINITY;
  return (
    leftGrade - rightGrade ||
    left.absolutePointDifference - right.absolutePointDifference ||
    left.totalLevelDistance - right.totalLevelDistance ||
    left.jobName.localeCompare(right.jobName, "es") ||
    right.valuationVersion - left.valuationVersion
  );
}

function summaryFromRow(row: ApprovedValuationRow): ApprovedValuationSummary {
  return {
    valuationId: row.valuation_id,
    valuationVersion: Number(row.valuation_version),
    jobId: row.job_id,
    jobCode: row.job_code,
    jobName: row.job_name,
    department: row.department,
    area: row.area,
    jobFamily: row.job_family,
    methodologyVersionId: row.methodology_version_id,
    methodologyCode: row.methodology_code,
    methodologyName: row.methodology_name,
    methodologyVersion: row.methodology_version,
    totalPoints: Number(row.total_points),
    gradeCode: row.grade_code,
    approvedAt: row.approved_at,
  };
}

function summaryOnly(snapshot: ComparableSnapshot): ApprovedValuationSummary {
  const { decisions: _decisions, ...summary } = snapshot;
  return summary;
}

function levelLabel(
  levels: MethodologyDefinition["factors"][number]["dimensions"][number]["levels"],
  code: string,
): string {
  return levels.find((level) => level.code === code)?.label ?? code;
}

function sameNormalized(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  return left.trim().toLocaleLowerCase("es") === right.trim().toLocaleLowerCase("es");
}
