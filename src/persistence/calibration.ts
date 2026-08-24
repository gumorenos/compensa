import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { CalibrationSummary } from "../domain/calibration.js";
import type {
  GoldStandardComparisonResult,
  GoldStandardJobSnapshot,
  GoldStandardMetrics,
  GoldStandardPartition,
} from "../domain/gold-standard.js";
import type { MethodologyDefinition, ValuationSelections } from "../domain/methodology.js";
import { PersistenceError, type Queryable } from "./database.js";

export type CalibrationRunStatus = "DRAFT" | "COMPLETED";
export type CalibrationCandidateSource = "MANUAL" | "EXTERNAL" | "AI";

export interface CalibrationRun {
  id: string;
  organizationId: string;
  name: string;
  partition: Exclude<GoldStandardPartition, "UNASSIGNED">;
  methodologyVersionId: string;
  candidateSource: CalibrationCandidateSource;
  candidateLabel: string | null;
  status: CalibrationRunStatus;
  summary: CalibrationSummary | null;
  createdByUserId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalibrationRunCase {
  id: string;
  organizationId: string;
  runId: string;
  caseId: string;
  caseCodeSnapshot: string;
  anonymizedLabelSnapshot: string;
  jobSnapshot: GoldStandardJobSnapshot;
  descriptionSnapshot: string | null;
  methodologySnapshot: MethodologyDefinition;
  referenceSelections: ValuationSelections;
  referencePoints: number;
  referenceGradeCode: string;
  candidateSelections: ValuationSelections | null;
  candidatePoints: number | null;
  candidateGradeCode: string | null;
  comparison: Extract<GoldStandardComparisonResult, { status: "SUCCESS" }> | null;
  evaluatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalibrationRunBundle {
  run: CalibrationRun;
  cases: CalibrationRunCase[];
}

export interface CreateCalibrationRunInput {
  organizationId: string;
  name: string;
  partition: Exclude<GoldStandardPartition, "UNASSIGNED">;
  methodologyVersionId: string;
  candidateSource?: CalibrationCandidateSource;
  candidateLabel?: string | null;
  createdByUserId?: string | null;
}

export interface CreateCalibrationRunCaseInput {
  organizationId: string;
  runId: string;
  caseId: string;
  caseCodeSnapshot: string;
  anonymizedLabelSnapshot: string;
  jobSnapshot: GoldStandardJobSnapshot;
  descriptionSnapshot?: string | null;
  methodologySnapshot: MethodologyDefinition;
  referenceSelections: ValuationSelections;
  referencePoints: number;
  referenceGradeCode: string;
}

interface CalibrationRunRow {
  id: string;
  organization_id: string;
  name: string;
  partition: Exclude<GoldStandardPartition, "UNASSIGNED">;
  methodology_version_id: string;
  candidate_source: CalibrationCandidateSource;
  candidate_label: string | null;
  status: CalibrationRunStatus;
  summary: CalibrationSummary | null;
  created_by_user_id: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CalibrationRunCaseRow {
  id: string;
  organization_id: string;
  run_id: string;
  case_id: string;
  case_code_snapshot: string;
  anonymized_label_snapshot: string;
  job_snapshot: GoldStandardJobSnapshot;
  description_snapshot: string | null;
  methodology_snapshot: MethodologyDefinition;
  reference_selections: ValuationSelections;
  reference_points: number | string;
  reference_grade_code: string;
  candidate_selections: ValuationSelections | null;
  candidate_points: number | string | null;
  candidate_grade_code: string | null;
  comparison: Extract<GoldStandardComparisonResult, { status: "SUCCESS" }> | null;
  evaluated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class CalibrationRepository {
  constructor(private readonly pool: Pool) {}

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createRun(input: CreateCalibrationRunInput, db: Queryable = this.pool): Promise<CalibrationRun> {
    const name = input.name.trim();
    if (name === "") throw new PersistenceError("CALIBRATION_NAME_REQUIRED", "Calibration run name is required.");
    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO calibration_runs (
        id, organization_id, name, partition, methodology_version_id,
        candidate_source, candidate_label, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        id,
        input.organizationId,
        name,
        input.partition,
        input.methodologyVersionId,
        input.candidateSource ?? "MANUAL",
        normalizeOptionalText(input.candidateLabel ?? null),
        input.createdByUserId ?? null,
      ],
    );
    return mapRun(requiredRow<CalibrationRunRow>(result.rows[0], "calibration run insert"));
  }

  async createRunCase(
    input: CreateCalibrationRunCaseInput,
    db: Queryable = this.pool,
  ): Promise<CalibrationRunCase> {
    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO calibration_run_cases (
        id, organization_id, run_id, case_id, case_code_snapshot,
        anonymized_label_snapshot, job_snapshot, description_snapshot,
        methodology_snapshot, reference_selections, reference_points, reference_grade_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11, $12)
      RETURNING *`,
      [
        id,
        input.organizationId,
        input.runId,
        input.caseId,
        input.caseCodeSnapshot,
        input.anonymizedLabelSnapshot,
        JSON.stringify(input.jobSnapshot),
        normalizeOptionalText(input.descriptionSnapshot ?? null),
        JSON.stringify(input.methodologySnapshot),
        JSON.stringify(input.referenceSelections),
        input.referencePoints,
        input.referenceGradeCode,
      ],
    );
    return mapRunCase(requiredRow<CalibrationRunCaseRow>(result.rows[0], "calibration case insert"));
  }

  async listRuns(organizationId: string, db: Queryable = this.pool): Promise<CalibrationRun[]> {
    const result = await db.query(
      `SELECT * FROM calibration_runs
       WHERE organization_id = $1
       ORDER BY created_at DESC, id DESC`,
      [organizationId],
    );
    return (result.rows as CalibrationRunRow[]).map(mapRun);
  }

  async getRun(
    organizationId: string,
    runId: string,
    db: Queryable = this.pool,
  ): Promise<CalibrationRun | null> {
    const result = await db.query(
      `SELECT * FROM calibration_runs WHERE id = $1 AND organization_id = $2`,
      [runId, organizationId],
    );
    const row = result.rows[0] as CalibrationRunRow | undefined;
    return row === undefined ? null : mapRun(row);
  }

  async listRunCases(
    organizationId: string,
    runId: string,
    db: Queryable = this.pool,
  ): Promise<CalibrationRunCase[]> {
    const result = await db.query(
      `SELECT * FROM calibration_run_cases
       WHERE organization_id = $1 AND run_id = $2
       ORDER BY case_code_snapshot, case_id`,
      [organizationId, runId],
    );
    return (result.rows as CalibrationRunCaseRow[]).map(mapRunCase);
  }

  async getRunCase(
    organizationId: string,
    runId: string,
    caseId: string,
    db: Queryable = this.pool,
  ): Promise<CalibrationRunCase | null> {
    const result = await db.query(
      `SELECT * FROM calibration_run_cases
       WHERE organization_id = $1 AND run_id = $2 AND case_id = $3`,
      [organizationId, runId, caseId],
    );
    const row = result.rows[0] as CalibrationRunCaseRow | undefined;
    return row === undefined ? null : mapRunCase(row);
  }

  async getRunBundle(
    organizationId: string,
    runId: string,
    db: Queryable = this.pool,
  ): Promise<CalibrationRunBundle | null> {
    const run = await this.getRun(organizationId, runId, db);
    if (run === null) return null;
    const cases = await this.listRunCases(organizationId, runId, db);
    return { run, cases };
  }

  async saveCandidateComparison(
    organizationId: string,
    runId: string,
    caseId: string,
    candidateSelections: ValuationSelections,
    comparison: Extract<GoldStandardComparisonResult, { status: "SUCCESS" }>,
    db: Queryable = this.pool,
  ): Promise<CalibrationRunCase> {
    const result = await db.query(
      `UPDATE calibration_run_cases
       SET candidate_selections = $4::jsonb,
           candidate_points = $5,
           candidate_grade_code = $6,
           comparison = $7::jsonb,
           evaluated_at = now(),
           updated_at = now()
       WHERE organization_id = $1 AND run_id = $2 AND case_id = $3
       RETURNING *`,
      [
        organizationId,
        runId,
        caseId,
        JSON.stringify(candidateSelections),
        comparison.metrics.candidatePoints,
        comparison.metrics.candidateGradeCode,
        JSON.stringify(comparison),
      ],
    );
    const row = result.rows[0] as CalibrationRunCaseRow | undefined;
    if (row === undefined) {
      throw new PersistenceError("CALIBRATION_CASE_NOT_FOUND", "Calibration case was not found or is not editable.");
    }
    return mapRunCase(row);
  }

  async completeRun(
    organizationId: string,
    runId: string,
    summary: CalibrationSummary,
    db: Queryable = this.pool,
  ): Promise<CalibrationRun> {
    const result = await db.query(
      `UPDATE calibration_runs
       SET status = 'COMPLETED', summary = $3::jsonb, completed_at = now(), updated_at = now()
       WHERE id = $1 AND organization_id = $2 AND status = 'DRAFT'
       RETURNING *`,
      [runId, organizationId, JSON.stringify(summary)],
    );
    const row = result.rows[0] as CalibrationRunRow | undefined;
    if (row === undefined) {
      throw new PersistenceError("CALIBRATION_RUN_NOT_DRAFT", "Calibration run was not found as an editable draft.");
    }
    return mapRun(row);
  }
}

export function metricsFromRunCase(item: CalibrationRunCase): GoldStandardMetrics | null {
  return item.comparison?.metrics ?? null;
}

function mapRun(row: CalibrationRunRow): CalibrationRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    partition: row.partition,
    methodologyVersionId: row.methodology_version_id,
    candidateSource: row.candidate_source,
    candidateLabel: row.candidate_label,
    status: row.status,
    summary: row.summary,
    createdByUserId: row.created_by_user_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRunCase(row: CalibrationRunCaseRow): CalibrationRunCase {
  return {
    id: row.id,
    organizationId: row.organization_id,
    runId: row.run_id,
    caseId: row.case_id,
    caseCodeSnapshot: row.case_code_snapshot,
    anonymizedLabelSnapshot: row.anonymized_label_snapshot,
    jobSnapshot: row.job_snapshot,
    descriptionSnapshot: row.description_snapshot,
    methodologySnapshot: row.methodology_snapshot,
    referenceSelections: row.reference_selections,
    referencePoints: Number(row.reference_points),
    referenceGradeCode: row.reference_grade_code,
    candidateSelections: row.candidate_selections,
    candidatePoints: row.candidate_points === null ? null : Number(row.candidate_points),
    candidateGradeCode: row.candidate_grade_code,
    comparison: row.comparison,
    evaluatedAt: row.evaluated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requiredRow<T>(value: unknown, context: string): T {
  if (value === undefined || value === null) {
    throw new PersistenceError("DATABASE_INVARIANT", `Database returned no row for ${context}.`);
  }
  return value as T;
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
