import type { Pool, PoolClient } from "pg";
import { aggregateCalibrationMetrics, orderCalibrationDeviations } from "../domain/calibration.js";
import { compareAgainstGoldStandard } from "../domain/gold-standard.js";
import type { ValuationSelections } from "../domain/methodology.js";
import { CompensaRepository, PersistenceError } from "../persistence/database.js";
import {
  CalibrationRepository,
  metricsFromRunCase,
  type CalibrationCandidateSource,
  type CalibrationRun,
  type CalibrationRunBundle,
  type CalibrationRunCase,
} from "../persistence/calibration.js";
import { GoldStandardRepository } from "../persistence/gold-standard.js";

export interface CreateCalibrationRunInput {
  name: string;
  partition: "CALIBRATION" | "HOLDOUT";
  methodologyVersionId: string;
  candidateSource?: CalibrationCandidateSource | undefined;
  candidateLabel?: string | null | undefined;
  createdByUserId?: string | null | undefined;
}

export interface CalibrationRunView extends CalibrationRunBundle {
  evaluatedCount: number;
  pendingCount: number;
  liveSummary: ReturnType<typeof aggregateCalibrationMetrics> | null;
  deviations: CalibrationRunCase[];
}

export interface CalibrationScopeCount {
  methodologyVersionId: string;
  methodologyCode: string;
  methodologyName: string;
  methodologyVersion: string;
  partition: "CALIBRATION" | "HOLDOUT";
  caseCount: number;
}

export class CalibrationService {
  private readonly calibration: CalibrationRepository;
  private readonly gold: GoldStandardRepository;
  private readonly core: CompensaRepository;

  constructor(private readonly pool: Pool) {
    this.calibration = new CalibrationRepository(pool);
    this.gold = new GoldStandardRepository(pool);
    this.core = new CompensaRepository(pool);
  }

  async listRuns(organizationId: string): Promise<CalibrationRun[]> {
    return this.calibration.listRuns(organizationId);
  }

  async listAvailableScopes(organizationId: string): Promise<CalibrationScopeCount[]> {
    const result = await this.pool.query(
      `SELECT
         gold.methodology_version_id,
         methodology.code AS methodology_code,
         methodology.name AS methodology_name,
         methodology.version AS methodology_version,
         gold.partition,
         count(*)::int AS case_count
       FROM gold_standard_cases gold
       JOIN methodology_versions methodology ON methodology.id = gold.methodology_version_id
       WHERE gold.organization_id = $1
         AND gold.status = 'VALIDATED'
         AND gold.partition IN ('CALIBRATION', 'HOLDOUT')
       GROUP BY gold.methodology_version_id, methodology.code, methodology.name,
                methodology.version, gold.partition
       ORDER BY methodology.name, methodology.version, gold.partition`,
      [organizationId],
    );
    return result.rows.map((row) => ({
      methodologyVersionId: row.methodology_version_id as string,
      methodologyCode: row.methodology_code as string,
      methodologyName: row.methodology_name as string,
      methodologyVersion: row.methodology_version as string,
      partition: row.partition as "CALIBRATION" | "HOLDOUT",
      caseCount: Number(row.case_count),
    }));
  }

  async createRun(
    organizationId: string,
    input: CreateCalibrationRunInput,
  ): Promise<CalibrationRunBundle> {
    if (input.partition !== "CALIBRATION" && input.partition !== "HOLDOUT") {
      throw new PersistenceError(
        "CALIBRATION_PARTITION_INVALID",
        "Calibration runs must use the CALIBRATION or HOLDOUT partition.",
      );
    }
    if ((input.candidateSource ?? "MANUAL") !== "MANUAL") {
      throw new PersistenceError(
        "CALIBRATION_SOURCE_NOT_AVAILABLE",
        "This version only creates MANUAL calibration runs; external and AI sources are reserved for later integrations.",
      );
    }

    return this.calibration.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `calibration-create:${organizationId}:${input.methodologyVersionId}:${input.partition}`,
      ]);
      const methodology = await this.core.getMethodologyVersionForOrganization(
        organizationId,
        input.methodologyVersionId,
        client,
      );
      if (methodology === null) {
        throw new PersistenceError(
          "METHODOLOGY_NOT_FOUND",
          "Calibration methodology is not available to this organization.",
        );
      }

      const eligible = await client.query(
        `SELECT id
         FROM gold_standard_cases
         WHERE organization_id = $1
           AND methodology_version_id = $2
           AND status = 'VALIDATED'
           AND partition = $3
         ORDER BY case_code, id
         FOR SHARE`,
        [organizationId, input.methodologyVersionId, input.partition],
      );
      if (eligible.rows.length === 0) {
        throw new PersistenceError(
          "CALIBRATION_NO_CASES",
          `No validated Gold Standard cases are assigned to ${input.partition} for the selected methodology.`,
        );
      }

      const run = await this.calibration.createRun(
        {
          organizationId,
          name: input.name,
          partition: input.partition,
          methodologyVersionId: methodology.id,
          candidateSource: "MANUAL",
          candidateLabel: input.candidateLabel ?? null,
          createdByUserId: input.createdByUserId ?? null,
        },
        client,
      );

      for (const row of eligible.rows) {
        const caseId = row.id as string;
        const bundle = await this.gold.getCaseBundle(organizationId, caseId, client);
        if (
          bundle === null ||
          bundle.case.status !== "VALIDATED" ||
          bundle.case.expectedTotalPoints === null ||
          bundle.case.expectedGradeCode === null
        ) {
          throw new PersistenceError(
            "CALIBRATION_REFERENCE_INVALID",
            `Gold Standard case ${caseId} is not a complete validated reference.`,
          );
        }
        const referenceSelections: ValuationSelections = Object.fromEntries(
          bundle.decisions.map((decision) => [decision.dimensionCode, decision.selectedLevelCode]),
        );
        const referenceCheck = compareAgainstGoldStandard(
          {
            methodology: bundle.case.methodologySnapshot,
            selections: referenceSelections,
            expectedPoints: bundle.case.expectedTotalPoints,
            expectedGradeCode: bundle.case.expectedGradeCode,
          },
          referenceSelections,
        );
        if (referenceCheck.status !== "SUCCESS") {
          throw new PersistenceError(
            "CALIBRATION_REFERENCE_INVALID",
            `Gold Standard case ${bundle.case.caseCode} cannot reproduce its own frozen result.`,
          );
        }

        await this.calibration.createRunCase(
          {
            organizationId,
            runId: run.id,
            caseId: bundle.case.id,
            caseCodeSnapshot: bundle.case.caseCode,
            anonymizedLabelSnapshot: bundle.case.anonymizedLabel,
            jobSnapshot: bundle.case.jobSnapshot,
            descriptionSnapshot: bundle.case.descriptionSnapshot,
            methodologySnapshot: bundle.case.methodologySnapshot,
            referenceSelections,
            referencePoints: bundle.case.expectedTotalPoints,
            referenceGradeCode: bundle.case.expectedGradeCode,
          },
          client,
        );
      }

      if (input.createdByUserId !== undefined && input.createdByUserId !== null) {
        await appendCalibrationAudit(client, {
          organizationId,
          actorUserId: input.createdByUserId,
          action: "CALIBRATION_RUN_CREATED",
          runId: run.id,
          payload: {
            partition: run.partition,
            methodologyVersionId: run.methodologyVersionId,
            caseCount: eligible.rows.length,
          },
        });
      }

      const created = await this.calibration.getRunBundle(organizationId, run.id, client);
      if (created === null) {
        throw new PersistenceError("DATABASE_INVARIANT", "Calibration run disappeared during creation.");
      }
      return created;
    });
  }

  async saveCandidate(
    organizationId: string,
    runId: string,
    caseId: string,
    candidateSelections: ValuationSelections,
  ): Promise<CalibrationRunCase> {
    return this.calibration.transaction(async (client) => {
      await lockRun(client, runId);
      const run = await this.calibration.getRun(organizationId, runId, client);
      if (run === null) {
        throw new PersistenceError("CALIBRATION_RUN_NOT_FOUND", "Calibration run was not found.");
      }
      if (run.status !== "DRAFT") {
        throw new PersistenceError("CALIBRATION_RUN_COMPLETED", "Completed calibration runs are immutable.");
      }
      const item = await this.calibration.getRunCase(organizationId, runId, caseId, client);
      if (item === null) {
        throw new PersistenceError("CALIBRATION_CASE_NOT_FOUND", "Calibration case was not found in this run.");
      }

      const allowedDimensions = new Set(
        item.methodologySnapshot.factors.flatMap((factor) =>
          factor.dimensions.map((dimension) => dimension.code),
        ),
      );
      const unknownDimensions = Object.keys(candidateSelections).filter(
        (dimensionCode) => !allowedDimensions.has(dimensionCode),
      );
      if (unknownDimensions.length > 0) {
        throw new PersistenceError(
          "CALIBRATION_UNKNOWN_DIMENSION",
          `Candidate contains dimensions outside the frozen methodology: ${unknownDimensions.join(", ")}.`,
        );
      }

      const comparison = compareAgainstGoldStandard(
        {
          methodology: item.methodologySnapshot,
          selections: item.referenceSelections,
          expectedPoints: item.referencePoints,
          expectedGradeCode: item.referenceGradeCode,
        },
        candidateSelections,
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
      return this.calibration.saveCandidateComparison(
        organizationId,
        runId,
        caseId,
        candidateSelections,
        comparison,
        client,
      );
    });
  }

  async completeRun(
    organizationId: string,
    runId: string,
    actorUserId?: string | null,
  ): Promise<CalibrationRun> {
    return this.calibration.transaction(async (client) => {
      await lockRun(client, runId);
      const bundle = await this.calibration.getRunBundle(organizationId, runId, client);
      if (bundle === null) {
        throw new PersistenceError("CALIBRATION_RUN_NOT_FOUND", "Calibration run was not found.");
      }
      if (bundle.run.status !== "DRAFT") {
        throw new PersistenceError("CALIBRATION_RUN_COMPLETED", "Calibration run is already completed.");
      }
      const pending = bundle.cases.filter((item) => item.comparison === null);
      if (pending.length > 0) {
        throw new PersistenceError(
          "CALIBRATION_INCOMPLETE",
          `${pending.length} case${pending.length === 1 ? "" : "s"} still require candidate selections before completion.`,
        );
      }
      if (bundle.cases.length === 0) {
        throw new PersistenceError("CALIBRATION_NO_CASES", "Calibration run contains no cases.");
      }
      const metrics = bundle.cases.map((item) => metricsFromRunCase(item));
      if (metrics.some((item) => item === null)) {
        throw new PersistenceError("DATABASE_INVARIANT", "A completed calibration candidate has no metrics.");
      }
      const summary = aggregateCalibrationMetrics(metrics.filter((item) => item !== null));
      const completed = await this.calibration.completeRun(organizationId, runId, summary, client);
      if (actorUserId !== undefined && actorUserId !== null) {
        await appendCalibrationAudit(client, {
          organizationId,
          actorUserId,
          action: "CALIBRATION_RUN_COMPLETED",
          runId,
          payload: {
            partition: completed.partition,
            methodologyVersionId: completed.methodologyVersionId,
            summary: completed.summary,
          },
        });
      }
      return completed;
    });
  }

  async getRunView(organizationId: string, runId: string): Promise<CalibrationRunView | null> {
    const bundle = await this.calibration.getRunBundle(organizationId, runId);
    if (bundle === null) return null;
    const evaluated = bundle.cases.filter((item) => item.comparison !== null);
    const metrics = evaluated.map((item) => item.comparison!.metrics);
    return {
      ...bundle,
      evaluatedCount: evaluated.length,
      pendingCount: bundle.cases.length - evaluated.length,
      liveSummary:
        bundle.run.status === "COMPLETED"
          ? bundle.run.summary
          : bundle.run.partition === "CALIBRATION" && metrics.length > 0
            ? aggregateCalibrationMetrics(metrics)
            : null,
      deviations: orderCalibrationDeviations(
        evaluated.map((item) => ({ ...item, metrics: item.comparison!.metrics })),
      ).map(({ metrics: _metrics, ...item }) => item),
    };
  }
}

interface CalibrationAuditInput {
  organizationId: string;
  actorUserId: string;
  action: "CALIBRATION_RUN_CREATED" | "CALIBRATION_RUN_COMPLETED";
  runId: string;
  payload: Record<string, unknown>;
}

async function appendCalibrationAudit(
  client: PoolClient,
  input: CalibrationAuditInput,
): Promise<void> {
  await client.query(
    `INSERT INTO security_audit_events
      (organization_id, actor_user_id, action, resource_type, resource_id, payload)
     VALUES ($1, $2, $3, 'CALIBRATION_RUN', $4, $5::jsonb)`,
    [
      input.organizationId,
      input.actorUserId,
      input.action,
      input.runId,
      JSON.stringify(input.payload),
    ],
  );
}

async function lockRun(client: PoolClient, runId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `calibration-run:${runId}`,
  ]);
}
