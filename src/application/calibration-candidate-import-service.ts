import type { Pool, PoolClient } from "pg";
import { compareAgainstGoldStandard, type GoldStandardMetrics } from "../domain/gold-standard.js";
import type { ValuationSelections } from "../domain/methodology.js";
import {
  CalibrationRepository,
  type CalibrationRun,
  type CalibrationRunCase,
} from "../persistence/calibration.js";
import { PersistenceError } from "../persistence/database.js";
import type {
  CalibrationCandidateImportCase,
  CalibrationCandidateImportDocument,
} from "./calibration-candidate-spreadsheet.js";

export interface CalibrationCandidatePreviewCase {
  caseCode: string;
  anonymizedLabel: string | null;
  status: "READY" | "OVERWRITE" | "INVALID";
  message: string | null;
  candidatePoints: number | null;
  candidateGradeCode: string | null;
  metrics: GoldStandardMetrics | null;
}

export interface CalibrationCandidateBatchPreview {
  runId: string;
  partition: "CALIBRATION" | "HOLDOUT";
  validCases: number;
  invalidCases: number;
  overwriteCases: number;
  canImport: boolean;
  cases: CalibrationCandidatePreviewCase[];
}

interface EvaluatedCandidate {
  item: CalibrationRunCase;
  selections: ValuationSelections;
  comparison: Extract<ReturnType<typeof compareAgainstGoldStandard>, { status: "SUCCESS" }>;
  overwrite: boolean;
}

export class CalibrationCandidateImportService {
  private readonly calibration: CalibrationRepository;

  constructor(private readonly pool: Pool) {
    this.calibration = new CalibrationRepository(pool);
  }

  async preview(
    organizationId: string,
    runId: string,
    input: unknown,
  ): Promise<CalibrationCandidateBatchPreview> {
    const document = parseCalibrationCandidateImport(input);
    const bundle = await this.calibration.getRunBundle(organizationId, runId);
    if (bundle === null) {
      throw new PersistenceError("CALIBRATION_RUN_NOT_FOUND", "Calibration run was not found.");
    }
    if (bundle.run.status !== "DRAFT") {
      throw new PersistenceError("CALIBRATION_RUN_COMPLETED", "Completed calibration runs cannot accept candidate imports.");
    }

    const byCode = new Map(bundle.cases.map((item) => [item.caseCodeSnapshot, item]));
    const cases: CalibrationCandidatePreviewCase[] = [];
    for (const candidate of document.cases) {
      const item = byCode.get(candidate.caseCode);
      if (item === undefined) {
        cases.push(invalidCase(candidate.caseCode, "El caso no pertenece a esta corrida."));
        continue;
      }
      try {
        const evaluated = evaluateCandidate(bundle.run, item, candidate.selections);
        const reveal = bundle.run.partition === "CALIBRATION";
        cases.push({
          caseCode: item.caseCodeSnapshot,
          anonymizedLabel: item.anonymizedLabelSnapshot,
          status: evaluated.overwrite ? "OVERWRITE" : "READY",
          message: evaluated.overwrite ? "Reemplazará el candidato guardado actualmente." : null,
          candidatePoints: reveal ? evaluated.comparison.metrics.candidatePoints : null,
          candidateGradeCode: reveal ? evaluated.comparison.metrics.candidateGradeCode : null,
          metrics: reveal ? evaluated.comparison.metrics : null,
        });
      } catch (error) {
        cases.push(invalidCase(item.caseCodeSnapshot, safeValidationMessage(error), item.anonymizedLabelSnapshot));
      }
    }

    const invalidCases = cases.filter((item) => item.status === "INVALID").length;
    const overwriteCases = cases.filter((item) => item.status === "OVERWRITE").length;
    return {
      runId,
      partition: bundle.run.partition,
      validCases: cases.length - invalidCases,
      invalidCases,
      overwriteCases,
      canImport: cases.length > 0 && invalidCases === 0,
      cases,
    };
  }

  async importBatch(
    organizationId: string,
    runId: string,
    input: unknown,
    actorUserId: string,
    fileName: string,
  ): Promise<{ importedCount: number; overwrittenCount: number }> {
    const document = parseCalibrationCandidateImport(input);
    return this.calibration.transaction(async (client) => {
      await lockRun(client, runId);
      const bundle = await this.calibration.getRunBundle(organizationId, runId, client);
      if (bundle === null) {
        throw new PersistenceError("CALIBRATION_RUN_NOT_FOUND", "Calibration run was not found.");
      }
      if (bundle.run.status !== "DRAFT") {
        throw new PersistenceError("CALIBRATION_RUN_COMPLETED", "Completed calibration runs cannot accept candidate imports.");
      }

      const byCode = new Map(bundle.cases.map((item) => [item.caseCodeSnapshot, item]));
      const evaluated: EvaluatedCandidate[] = [];
      for (const candidate of document.cases) {
        const item = byCode.get(candidate.caseCode);
        if (item === undefined) {
          throw new PersistenceError(
            "CALIBRATION_IMPORT_CASE_NOT_FOUND",
            `Candidate case ${candidate.caseCode} does not belong to this calibration run.`,
          );
        }
        evaluated.push(evaluateCandidate(bundle.run, item, candidate.selections));
      }

      for (const candidate of evaluated) {
        await this.calibration.saveCandidateComparison(
          organizationId,
          runId,
          candidate.item.caseId,
          candidate.selections,
          candidate.comparison,
          client,
        );
      }

      const overwrittenCount = evaluated.filter((item) => item.overwrite).length;
      await appendImportAudit(client, {
        organizationId,
        actorUserId,
        runId,
        fileName,
        importedCount: evaluated.length,
        overwrittenCount,
        partition: bundle.run.partition,
        caseCodes: evaluated.map((item) => item.item.caseCodeSnapshot),
      });
      return { importedCount: evaluated.length, overwrittenCount };
    });
  }
}

export function parseCalibrationCandidateImport(input: unknown): CalibrationCandidateImportDocument {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.cases) || input.cases.length === 0) {
    throw new PersistenceError(
      "CALIBRATION_IMPORT_INVALID_DOCUMENT",
      "Calibration candidate import must contain version 1 and a non-empty cases array.",
    );
  }
  if (input.cases.length > 500) {
    throw new PersistenceError("CALIBRATION_IMPORT_TOO_MANY_CASES", "A candidate import cannot exceed 500 cases.");
  }

  const seen = new Set<string>();
  const cases: CalibrationCandidateImportCase[] = input.cases.map((value, index) => {
    if (!isRecord(value)) invalidRow(index, "case must be an object");
    const caseCode = requiredString(value.caseCode, index, "caseCode");
    if (seen.has(caseCode)) {
      throw new PersistenceError("CALIBRATION_IMPORT_DUPLICATE_CASE", `Duplicate caseCode in import: ${caseCode}.`);
    }
    seen.add(caseCode);
    if (!isRecord(value.selections)) invalidRow(index, "selections must be an object");
    const selections: ValuationSelections = {};
    for (const [dimensionCode, rawLevel] of Object.entries(value.selections)) {
      const dimension = dimensionCode.trim();
      if (dimension === "") invalidRow(index, "selection dimension code cannot be empty");
      if (typeof rawLevel !== "string" || rawLevel.trim() === "") {
        invalidRow(index, `selection ${dimension} must use a non-empty level code`);
      }
      selections[dimension] = rawLevel.trim();
    }
    if (Object.keys(selections).length === 0) invalidRow(index, "selections cannot be empty");
    return { caseCode, selections };
  });
  return { version: 1, cases };
}

function evaluateCandidate(
  run: CalibrationRun,
  item: CalibrationRunCase,
  selections: ValuationSelections,
): EvaluatedCandidate {
  const allowedDimensions = new Set(
    item.methodologySnapshot.factors.flatMap((factor) => factor.dimensions.map((dimension) => dimension.code)),
  );
  const unknown = Object.keys(selections).filter((code) => !allowedDimensions.has(code));
  if (unknown.length > 0) {
    throw new PersistenceError(
      "CALIBRATION_UNKNOWN_DIMENSION",
      `Candidate contains dimensions outside the frozen methodology: ${unknown.join(", ")}.`,
    );
  }

  const comparison = compareAgainstGoldStandard(
    {
      methodology: item.methodologySnapshot,
      selections: item.referenceSelections,
      expectedPoints: item.referencePoints,
      expectedGradeCode: item.referenceGradeCode,
    },
    selections,
  );
  if (comparison.status === "INVALID_CANDIDATE") {
    throw new PersistenceError(
      "CALIBRATION_CANDIDATE_INVALID",
      comparison.errors.map((error) => `${error.code}: ${error.message}`).join("; "),
    );
  }
  if (comparison.status === "INVALID_REFERENCE") {
    throw new PersistenceError(
      "CALIBRATION_REFERENCE_INVALID",
      comparison.errors.map((error) => `${error.code}: ${error.message}`).join("; "),
    );
  }
  return {
    item,
    selections,
    comparison,
    overwrite: item.candidateSelections !== null,
  };
}

function invalidCase(
  caseCode: string,
  message: string,
  anonymizedLabel: string | null = null,
): CalibrationCandidatePreviewCase {
  return {
    caseCode,
    anonymizedLabel,
    status: "INVALID",
    message,
    candidatePoints: null,
    candidateGradeCode: null,
    metrics: null,
  };
}

function safeValidationMessage(error: unknown): string {
  if (error instanceof PersistenceError) return error.message;
  return "El candidato no puede validarse contra la metodología congelada.";
}

interface AuditInput {
  organizationId: string;
  actorUserId: string;
  runId: string;
  fileName: string;
  importedCount: number;
  overwrittenCount: number;
  partition: "CALIBRATION" | "HOLDOUT";
  caseCodes: string[];
}

async function appendImportAudit(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `INSERT INTO security_audit_events
      (organization_id, actor_user_id, action, resource_type, resource_id, payload)
     VALUES ($1, $2, 'CALIBRATION_CANDIDATE_BATCH_IMPORTED', 'CALIBRATION_RUN', $3, $4::jsonb)`,
    [
      input.organizationId,
      input.actorUserId,
      input.runId,
      JSON.stringify({
        fileName: input.fileName,
        importedCount: input.importedCount,
        overwrittenCount: input.overwrittenCount,
        partition: input.partition,
        caseCodes: input.caseCodes,
      }),
    ],
  );
}

async function lockRun(client: PoolClient, runId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `calibration-run:${runId}`,
  ]);
}

function requiredString(value: unknown, index: number, field: string): string {
  if (typeof value !== "string" || value.trim() === "") invalidRow(index, `${field} is required`);
  return value.trim();
}

function invalidRow(index: number, message: string): never {
  throw new PersistenceError("CALIBRATION_IMPORT_INVALID_CASE", `Case ${index + 1}: ${message}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
