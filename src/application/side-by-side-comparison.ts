import type { Pool } from "pg";
import type { MethodologyDefinition } from "../domain/methodology.js";
import type { ApprovedValuationSummary } from "./comparables-service.js";

export type SideBySideComparisonErrorCode =
  | "INVALID_SELECTION_COUNT"
  | "VALUATION_NOT_AVAILABLE"
  | "METHODOLOGY_VERSION_MISMATCH";

export class SideBySideComparisonError extends Error {
  constructor(
    public readonly code: SideBySideComparisonErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SideBySideComparisonError";
  }
}

export interface SideBySideLevelCell {
  valuationId: string;
  levelCode: string | null;
  levelLabel: string | null;
}

export type SideBySideDimensionComparison = "SAME_LEVEL" | "ALL_MISSING" | "DIFFERENT";

export interface SideBySideDimensionRow {
  factorCode: string;
  factorName: string;
  dimensionCode: string;
  dimensionName: string;
  required: boolean;
  comparison: SideBySideDimensionComparison;
  cells: SideBySideLevelCell[];
}

export interface SideBySideComparisonReport {
  methodologyVersionId: string;
  methodologyCode: string;
  methodologyName: string;
  methodologyVersion: string;
  valuations: ApprovedValuationSummary[];
  dimensions: SideBySideDimensionRow[];
  pointMin: number;
  pointMax: number;
  pointSpread: number;
  gradeCodes: string[];
}

interface ComparisonValuationRow {
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

interface ComparisonDecisionRow {
  valuation_id: string;
  dimension_code: string;
  selected_level_code: string;
}

export class SideBySideComparisonService {
  constructor(private readonly pool: Pool) {}

  async getReport(
    organizationId: string,
    requestedValuationIds: readonly string[],
  ): Promise<SideBySideComparisonReport> {
    const valuationIds = uniqueIds(requestedValuationIds);
    if (valuationIds.length < 2 || valuationIds.length > 5) {
      throw new SideBySideComparisonError(
        "INVALID_SELECTION_COUNT",
        "Select between 2 and 5 approved valuations.",
      );
    }
    if (valuationIds.some((id) => !isUuid(id))) {
      throw new SideBySideComparisonError(
        "VALUATION_NOT_AVAILABLE",
        "One or more selected valuations are unavailable for comparison.",
      );
    }

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
         AND v.id = ANY($2::uuid[])
         AND v.status = 'APPROVED'
         AND v.total_points IS NOT NULL
         AND v.grade_code IS NOT NULL`,
      [organizationId, valuationIds],
    );

    const rows = result.rows as ComparisonValuationRow[];
    if (rows.length !== valuationIds.length) {
      throw new SideBySideComparisonError(
        "VALUATION_NOT_AVAILABLE",
        "One or more selected valuations are unavailable for comparison.",
      );
    }

    const rowById = new Map(rows.map((row) => [row.valuation_id, row]));
    const orderedRows = valuationIds.map((id) => rowById.get(id)!);
    const methodologyVersionId = orderedRows[0]!.methodology_version_id;
    if (orderedRows.some((row) => row.methodology_version_id !== methodologyVersionId)) {
      throw new SideBySideComparisonError(
        "METHODOLOGY_VERSION_MISMATCH",
        "Selected valuations must use exactly the same methodology version.",
      );
    }

    const methodology = orderedRows[0]!.methodology_definition;
    const decisions = await this.loadDecisions(organizationId, valuationIds);
    return buildSideBySideComparisonReport(
      methodology,
      orderedRows.map(summaryFromRow),
      decisions,
    );
  }

  private async loadDecisions(
    organizationId: string,
    valuationIds: readonly string[],
  ): Promise<Map<string, Map<string, string>>> {
    const result = await this.pool.query(
      `SELECT valuation_id, dimension_code, selected_level_code
       FROM valuation_decisions
       WHERE organization_id = $1
         AND valuation_id = ANY($2::uuid[])
       ORDER BY valuation_id, dimension_code`,
      [organizationId, valuationIds],
    );

    const grouped = new Map<string, Map<string, string>>();
    for (const row of result.rows as ComparisonDecisionRow[]) {
      const current = grouped.get(row.valuation_id) ?? new Map<string, string>();
      current.set(row.dimension_code, row.selected_level_code);
      grouped.set(row.valuation_id, current);
    }
    return grouped;
  }
}

export function buildSideBySideComparisonReport(
  methodology: MethodologyDefinition,
  valuations: readonly ApprovedValuationSummary[],
  decisionsByValuation: ReadonlyMap<string, ReadonlyMap<string, string>>,
): SideBySideComparisonReport {
  if (valuations.length < 2 || valuations.length > 5) {
    throw new SideBySideComparisonError(
      "INVALID_SELECTION_COUNT",
      "Select between 2 and 5 approved valuations.",
    );
  }
  const methodologyVersionId = valuations[0]!.methodologyVersionId;
  if (valuations.some((valuation) => valuation.methodologyVersionId !== methodologyVersionId)) {
    throw new SideBySideComparisonError(
      "METHODOLOGY_VERSION_MISMATCH",
      "Selected valuations must use exactly the same methodology version.",
    );
  }

  const dimensions: SideBySideDimensionRow[] = methodology.factors.flatMap((factor) =>
    factor.dimensions.map((dimension) => {
      const cells = valuations.map((valuation): SideBySideLevelCell => {
        const levelCode = decisionsByValuation.get(valuation.valuationId)?.get(dimension.code) ?? null;
        return {
          valuationId: valuation.valuationId,
          levelCode,
          levelLabel:
            levelCode === null
              ? null
              : dimension.levels.find((level) => level.code === levelCode)?.label ?? levelCode,
        };
      });
      const levelCodes = cells.map((cell) => cell.levelCode);
      const allMissing = levelCodes.every((code) => code === null);
      const sameLevel = !allMissing && levelCodes.every((code) => code === levelCodes[0]);
      return {
        factorCode: factor.code,
        factorName: factor.name,
        dimensionCode: dimension.code,
        dimensionName: dimension.name,
        required: dimension.required,
        comparison: allMissing ? "ALL_MISSING" : sameLevel ? "SAME_LEVEL" : "DIFFERENT",
        cells,
      };
    }),
  );

  const points = valuations.map((valuation) => valuation.totalPoints);
  const pointMin = Math.min(...points);
  const pointMax = Math.max(...points);
  const gradeCodes = [...new Set(valuations.map((valuation) => valuation.gradeCode))];
  const first = valuations[0]!;

  return {
    methodologyVersionId,
    methodologyCode: first.methodologyCode,
    methodologyName: first.methodologyName,
    methodologyVersion: first.methodologyVersion,
    valuations: [...valuations],
    dimensions,
    pointMin,
    pointMax,
    pointSpread: pointMax - pointMin,
    gradeCodes,
  };
}

function uniqueIds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function summaryFromRow(row: ComparisonValuationRow): ApprovedValuationSummary {
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
