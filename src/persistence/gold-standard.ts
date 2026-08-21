import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type {
  GoldStandardCaseStatus,
  GoldStandardJobSnapshot,
  GoldStandardPartition,
  GoldStandardSourceType,
} from "../domain/gold-standard.js";
import type { MethodologyDefinition } from "../domain/methodology.js";
import {
  PersistenceError,
  type EvidenceSourceType,
  type Queryable,
} from "./database.js";

export interface GoldStandardCase {
  id: string;
  organizationId: string;
  caseCode: string;
  anonymizedLabel: string;
  sourceType: GoldStandardSourceType;
  sourceValuationId: string | null;
  methodologyVersionId: string;
  jobDescriptionVersionId: string | null;
  status: GoldStandardCaseStatus;
  partition: GoldStandardPartition;
  isAnchor: boolean;
  jobSnapshot: GoldStandardJobSnapshot;
  methodologySnapshot: MethodologyDefinition;
  descriptionSnapshot: string | null;
  expectedTotalPoints: number | null;
  expectedGradeCode: string | null;
  expertUserId: string | null;
  createdByUserId: string | null;
  notes: string | null;
  validatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoldStandardDecision {
  id: string;
  organizationId: string;
  caseId: string;
  dimensionCode: string;
  selectedLevelCode: string;
  justification: string | null;
  createdAt: Date;
}

export interface GoldStandardEvidence {
  id: string;
  organizationId: string;
  caseId: string;
  decisionId: string;
  sourceType: EvidenceSourceType;
  sourceSection: string | null;
  excerpt: string;
  createdAt: Date;
}

export interface GoldStandardCaseBundle {
  case: GoldStandardCase;
  decisions: GoldStandardDecision[];
  evidence: GoldStandardEvidence[];
}

export interface CreateGoldStandardCaseInput {
  organizationId: string;
  caseCode: string;
  anonymizedLabel: string;
  sourceType: GoldStandardSourceType;
  sourceValuationId?: string | null;
  methodologyVersionId: string;
  jobDescriptionVersionId?: string | null;
  status: GoldStandardCaseStatus;
  partition?: GoldStandardPartition;
  isAnchor?: boolean;
  jobSnapshot: GoldStandardJobSnapshot;
  methodologySnapshot: MethodologyDefinition;
  descriptionSnapshot?: string | null;
  expectedTotalPoints?: number | null;
  expectedGradeCode?: string | null;
  expertUserId?: string | null;
  createdByUserId?: string | null;
  notes?: string | null;
  validatedAt?: Date | null;
}

export interface CreateGoldStandardDecisionInput {
  organizationId: string;
  caseId: string;
  dimensionCode: string;
  selectedLevelCode: string;
  justification?: string | null;
}

export interface CreateGoldStandardEvidenceInput {
  organizationId: string;
  caseId: string;
  decisionId: string;
  sourceType: EvidenceSourceType;
  sourceSection?: string | null;
  excerpt: string;
}

interface GoldStandardCaseRow {
  id: string;
  organization_id: string;
  case_code: string;
  anonymized_label: string;
  source_type: GoldStandardSourceType;
  source_valuation_id: string | null;
  methodology_version_id: string;
  job_description_version_id: string | null;
  status: GoldStandardCaseStatus;
  partition: GoldStandardPartition;
  is_anchor: boolean;
  job_snapshot: GoldStandardJobSnapshot;
  methodology_snapshot: MethodologyDefinition;
  description_snapshot: string | null;
  expected_total_points: string | number | null;
  expected_grade_code: string | null;
  expert_user_id: string | null;
  created_by_user_id: string | null;
  notes: string | null;
  validated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface GoldStandardDecisionRow {
  id: string;
  organization_id: string;
  case_id: string;
  dimension_code: string;
  selected_level_code: string;
  justification: string | null;
  created_at: Date;
}

interface GoldStandardEvidenceRow {
  id: string;
  organization_id: string;
  case_id: string;
  decision_id: string;
  source_type: EvidenceSourceType;
  source_section: string | null;
  excerpt: string;
  created_at: Date;
}

export class GoldStandardRepository {
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

  async createCase(
    input: CreateGoldStandardCaseInput,
    db: Queryable = this.pool,
  ): Promise<GoldStandardCase> {
    const caseCode = input.caseCode.trim();
    const anonymizedLabel = input.anonymizedLabel.trim();
    if (caseCode === "") {
      throw new PersistenceError("GOLD_CASE_CODE_REQUIRED", "Gold Standard case code is required.");
    }
    if (anonymizedLabel === "") {
      throw new PersistenceError(
        "GOLD_CASE_LABEL_REQUIRED",
        "Gold Standard anonymized label is required.",
      );
    }

    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO gold_standard_cases (
        id, organization_id, case_code, anonymized_label, source_type,
        source_valuation_id, methodology_version_id, job_description_version_id,
        status, partition, is_anchor, job_snapshot, methodology_snapshot,
        description_snapshot, expected_total_points, expected_grade_code,
        expert_user_id, created_by_user_id, notes, validated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12::jsonb, $13::jsonb,
        $14, $15, $16, $17, $18, $19, $20
      )
      RETURNING *`,
      [
        id,
        input.organizationId,
        caseCode,
        anonymizedLabel,
        input.sourceType,
        input.sourceValuationId ?? null,
        input.methodologyVersionId,
        input.jobDescriptionVersionId ?? null,
        input.status,
        input.partition ?? "UNASSIGNED",
        input.isAnchor ?? false,
        JSON.stringify(input.jobSnapshot),
        JSON.stringify(input.methodologySnapshot),
        normalizeOptionalText(input.descriptionSnapshot ?? null),
        input.expectedTotalPoints ?? null,
        normalizeOptionalText(input.expectedGradeCode ?? null),
        input.expertUserId ?? null,
        input.createdByUserId ?? null,
        normalizeOptionalText(input.notes ?? null),
        input.validatedAt ?? null,
      ],
    );
    return mapCase(requiredRow<GoldStandardCaseRow>(result.rows[0], "gold standard case insert"));
  }

  async createDecision(
    input: CreateGoldStandardDecisionInput,
    db: Queryable = this.pool,
  ): Promise<GoldStandardDecision> {
    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO gold_standard_decisions (
        id, organization_id, case_id, dimension_code, selected_level_code, justification
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        id,
        input.organizationId,
        input.caseId,
        input.dimensionCode,
        input.selectedLevelCode,
        normalizeOptionalText(input.justification ?? null),
      ],
    );
    return mapDecision(
      requiredRow<GoldStandardDecisionRow>(result.rows[0], "gold standard decision insert"),
    );
  }

  async createEvidence(
    input: CreateGoldStandardEvidenceInput,
    db: Queryable = this.pool,
  ): Promise<GoldStandardEvidence> {
    const excerpt = input.excerpt.trim();
    if (excerpt === "") {
      throw new PersistenceError("GOLD_EVIDENCE_EMPTY", "Gold Standard evidence cannot be empty.");
    }

    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO gold_standard_evidence (
        id, organization_id, case_id, decision_id, source_type, source_section, excerpt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        id,
        input.organizationId,
        input.caseId,
        input.decisionId,
        input.sourceType,
        normalizeOptionalText(input.sourceSection ?? null),
        excerpt,
      ],
    );
    return mapEvidence(
      requiredRow<GoldStandardEvidenceRow>(result.rows[0], "gold standard evidence insert"),
    );
  }

  async validateCase(
    organizationId: string,
    caseId: string,
    expectedTotalPoints: number,
    expectedGradeCode: string,
    db: Queryable = this.pool,
  ): Promise<GoldStandardCase> {
    if (!Number.isFinite(expectedTotalPoints)) {
      throw new PersistenceError(
        "GOLD_CASE_INVALID_POINTS",
        "Gold Standard expected points must be finite.",
      );
    }
    const gradeCode = expectedGradeCode.trim();
    if (gradeCode === "") {
      throw new PersistenceError(
        "GOLD_CASE_GRADE_REQUIRED",
        "Gold Standard expected grade is required before validation.",
      );
    }

    const result = await db.query(
      `UPDATE gold_standard_cases
       SET status = 'VALIDATED',
           expected_total_points = $3,
           expected_grade_code = $4,
           validated_at = now(),
           updated_at = now()
       WHERE id = $1 AND organization_id = $2 AND status = 'DRAFT'
       RETURNING *`,
      [caseId, organizationId, expectedTotalPoints, gradeCode],
    );
    const row = result.rows[0] as GoldStandardCaseRow | undefined;
    if (row === undefined) {
      throw new PersistenceError(
        "GOLD_CASE_NOT_DRAFT",
        "Gold Standard case was not found as an editable draft.",
      );
    }
    return mapCase(row);
  }

  async getCase(
    organizationId: string,
    caseId: string,
    db: Queryable = this.pool,
  ): Promise<GoldStandardCase | null> {
    const result = await db.query(
      "SELECT * FROM gold_standard_cases WHERE id = $1 AND organization_id = $2",
      [caseId, organizationId],
    );
    const row = result.rows[0] as GoldStandardCaseRow | undefined;
    return row === undefined ? null : mapCase(row);
  }

  async getCaseBySourceValuation(
    organizationId: string,
    valuationId: string,
    db: Queryable = this.pool,
  ): Promise<GoldStandardCase | null> {
    const result = await db.query(
      `SELECT * FROM gold_standard_cases
       WHERE organization_id = $1 AND source_valuation_id = $2`,
      [organizationId, valuationId],
    );
    const row = result.rows[0] as GoldStandardCaseRow | undefined;
    return row === undefined ? null : mapCase(row);
  }

  async listCases(
    organizationId: string,
    db: Queryable = this.pool,
  ): Promise<GoldStandardCase[]> {
    const result = await db.query(
      `SELECT * FROM gold_standard_cases
       WHERE organization_id = $1
       ORDER BY created_at, id`,
      [organizationId],
    );
    return (result.rows as GoldStandardCaseRow[]).map(mapCase);
  }

  async listDecisions(
    organizationId: string,
    caseId: string,
    db: Queryable = this.pool,
  ): Promise<GoldStandardDecision[]> {
    const result = await db.query(
      `SELECT * FROM gold_standard_decisions
       WHERE organization_id = $1 AND case_id = $2
       ORDER BY dimension_code`,
      [organizationId, caseId],
    );
    return (result.rows as GoldStandardDecisionRow[]).map(mapDecision);
  }

  async listEvidence(
    organizationId: string,
    caseId: string,
    db: Queryable = this.pool,
  ): Promise<GoldStandardEvidence[]> {
    const result = await db.query(
      `SELECT * FROM gold_standard_evidence
       WHERE organization_id = $1 AND case_id = $2
       ORDER BY created_at, id`,
      [organizationId, caseId],
    );
    return (result.rows as GoldStandardEvidenceRow[]).map(mapEvidence);
  }

  async getCaseBundle(
    organizationId: string,
    caseId: string,
    db: Queryable = this.pool,
  ): Promise<GoldStandardCaseBundle | null> {
    const goldCase = await this.getCase(organizationId, caseId, db);
    if (goldCase === null) return null;
    const decisions = await this.listDecisions(organizationId, caseId, db);
    const evidence = await this.listEvidence(organizationId, caseId, db);
    return { case: goldCase, decisions, evidence };
  }

  async updatePartition(
    organizationId: string,
    caseId: string,
    partition: GoldStandardPartition,
    db: Queryable = this.pool,
  ): Promise<GoldStandardCase> {
    const result = await db.query(
      `UPDATE gold_standard_cases
       SET partition = $3, updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [caseId, organizationId, partition],
    );
    const row = result.rows[0] as GoldStandardCaseRow | undefined;
    if (row === undefined) {
      throw new PersistenceError("GOLD_CASE_NOT_FOUND", "Gold Standard case was not found.");
    }
    return mapCase(row);
  }
}

function mapCase(row: GoldStandardCaseRow): GoldStandardCase {
  return {
    id: row.id,
    organizationId: row.organization_id,
    caseCode: row.case_code,
    anonymizedLabel: row.anonymized_label,
    sourceType: row.source_type,
    sourceValuationId: row.source_valuation_id,
    methodologyVersionId: row.methodology_version_id,
    jobDescriptionVersionId: row.job_description_version_id,
    status: row.status,
    partition: row.partition,
    isAnchor: row.is_anchor,
    jobSnapshot: row.job_snapshot,
    methodologySnapshot: row.methodology_snapshot,
    descriptionSnapshot: row.description_snapshot,
    expectedTotalPoints:
      row.expected_total_points === null ? null : Number(row.expected_total_points),
    expectedGradeCode: row.expected_grade_code,
    expertUserId: row.expert_user_id,
    createdByUserId: row.created_by_user_id,
    notes: row.notes,
    validatedAt: row.validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDecision(row: GoldStandardDecisionRow): GoldStandardDecision {
  return {
    id: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    dimensionCode: row.dimension_code,
    selectedLevelCode: row.selected_level_code,
    justification: row.justification,
    createdAt: row.created_at,
  };
}

function mapEvidence(row: GoldStandardEvidenceRow): GoldStandardEvidence {
  return {
    id: row.id,
    organizationId: row.organization_id,
    caseId: row.case_id,
    decisionId: row.decision_id,
    sourceType: row.source_type,
    sourceSection: row.source_section,
    excerpt: row.excerpt,
    createdAt: row.created_at,
  };
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requiredRow<T>(value: unknown, context: string): T {
  if (value === undefined || value === null) {
    throw new PersistenceError("DATABASE_INVARIANT", `Database returned no row for ${context}.`);
  }
  return value as T;
}
