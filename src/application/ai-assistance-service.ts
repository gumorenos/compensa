import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { MethodologyDefinition } from "../domain/methodology.js";
import {
  AIAssistanceValidationError,
  toProviderMethodologyContext,
  validateAIAssistanceProviderResult,
  type AIAssistanceProvider,
  type AIAssistanceProviderInput,
  type ValidatedAIAssistanceResult,
} from "../ai/contracts.js";

export type AIAssistanceErrorCode =
  | "AI_VALUATION_NOT_FOUND"
  | "AI_VALUATION_NOT_EDITABLE"
  | "AI_JOB_DESCRIPTION_REQUIRED"
  | "AI_JOB_DESCRIPTION_NOT_FOUND"
  | "AI_METHODOLOGY_NOT_FOUND"
  | "AI_PROVIDER_METADATA_INVALID"
  | "AI_PROVIDER_FAILED"
  | "AI_INPUT_CHANGED";

export class AIAssistanceError extends Error {
  constructor(
    public readonly code: AIAssistanceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AIAssistanceError";
  }
}

export interface SavedAISuggestionEvidence {
  id: string;
  excerpt: string;
  sourceSection: string | null;
}

export interface SavedAIFactorSuggestion {
  id: string;
  dimensionCode: string;
  suggestedLevelCode: string | null;
  confidence: number | null;
  rationale: string;
  evidence: SavedAISuggestionEvidence[];
}

export interface SavedAIClarificationQuestion {
  id: string;
  dimensionCode: string | null;
  question: string;
  reason: string;
  status: "OPEN" | "ANSWERED" | "DISMISSED";
}

export interface AIAssistanceRunSnapshot {
  id: string;
  organizationId: string;
  valuationId: string;
  methodologyVersionId: string;
  jobDescriptionVersionId: string;
  providerId: string;
  modelId: string | null;
  promptVersion: string;
  inputFingerprint: string;
  status: "COMPLETED" | "FAILED";
  createdByUserId: string | null;
  createdAt: Date;
  completedAt: Date;
  suggestions: SavedAIFactorSuggestion[];
  clarifications: SavedAIClarificationQuestion[];
}

interface PreparedInput {
  providerInput: AIAssistanceProviderInput;
  methodology: MethodologyDefinition;
  methodologyVersionId: string;
  jobDescriptionVersionId: string;
  inputFingerprint: string;
}

interface PreparationRow {
  status: string;
  methodology_version_id: string;
  job_description_version_id: string | null;
  description_id: string | null;
  description_content: string | null;
  methodology_definition: MethodologyDefinition;
}

interface RunRow {
  id: string;
  organization_id: string;
  valuation_id: string;
  methodology_version_id: string;
  job_description_version_id: string;
  provider_id: string;
  model_id: string | null;
  prompt_version: string;
  input_fingerprint: string;
  status: "COMPLETED" | "FAILED";
  created_by_user_id: string | null;
  created_at: Date;
  completed_at: Date;
}

const PROVIDER_ID_MAX = 120;
const MODEL_ID_MAX = 240;
const PROMPT_VERSION_MAX = 120;

export class AIAssistanceService {
  constructor(
    private readonly pool: Pool,
    private readonly provider: AIAssistanceProvider,
    private readonly promptVersion: string,
  ) {
    validateProviderMetadata(provider, promptVersion);
  }

  async generate(
    organizationId: string,
    valuationId: string,
    actorUserId: string,
  ): Promise<AIAssistanceRunSnapshot> {
    const prepared = await this.prepare(organizationId, valuationId);

    let rawResult: unknown;
    try {
      rawResult = await this.provider.analyze(prepared.providerInput);
    } catch (error) {
      if (error instanceof AIAssistanceValidationError) throw error;
      throw new AIAssistanceError(
        "AI_PROVIDER_FAILED",
        "The configured AI assistance provider failed before producing a valid result.",
      );
    }

    const result = validateAIAssistanceProviderResult(
      rawResult,
      prepared.methodology,
      prepared.providerInput.jobDescription.content,
    );

    return this.persistCompletedRun(
      organizationId,
      valuationId,
      actorUserId,
      prepared,
      result,
    );
  }

  async getRun(
    organizationId: string,
    runId: string,
  ): Promise<AIAssistanceRunSnapshot | null> {
    const runResult = await this.pool.query(
      `SELECT id, organization_id, valuation_id, methodology_version_id,
              job_description_version_id, provider_id, model_id, prompt_version,
              input_fingerprint, status, created_by_user_id, created_at, completed_at
       FROM ai_assistance_runs
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, runId],
    );
    const run = runResult.rows[0] as RunRow | undefined;
    if (run === undefined) return null;
    return hydrateRun(this.pool, run);
  }

  private async prepare(organizationId: string, valuationId: string): Promise<PreparedInput> {
    const result = await this.pool.query(
      `SELECT
         v.status,
         v.methodology_version_id,
         v.job_description_version_id,
         d.id AS description_id,
         d.content AS description_content,
         m.definition AS methodology_definition
       FROM valuations v
       LEFT JOIN job_description_versions d
         ON d.id = v.job_description_version_id
        AND d.organization_id = v.organization_id
       JOIN methodology_versions m
         ON m.id = v.methodology_version_id
        AND (m.organization_id IS NULL OR m.organization_id = v.organization_id)
       WHERE v.organization_id = $1
         AND v.id = $2`,
      [organizationId, valuationId],
    );
    const row = result.rows[0] as PreparationRow | undefined;
    if (row === undefined) {
      throw new AIAssistanceError(
        "AI_VALUATION_NOT_FOUND",
        "Valuation is not available in this organization.",
      );
    }
    requireEditableStatus(row.status);
    if (row.job_description_version_id === null) {
      throw new AIAssistanceError(
        "AI_JOB_DESCRIPTION_REQUIRED",
        "AI assistance requires a job-description version pinned to the valuation.",
      );
    }
    if (row.description_id === null || row.description_content === null) {
      throw new AIAssistanceError(
        "AI_JOB_DESCRIPTION_NOT_FOUND",
        "The job-description version pinned to this valuation is not available.",
      );
    }
    if (row.methodology_definition === null || typeof row.methodology_definition !== "object") {
      throw new AIAssistanceError(
        "AI_METHODOLOGY_NOT_FOUND",
        "The methodology version pinned to this valuation is not available.",
      );
    }

    const providerInput: AIAssistanceProviderInput = {
      valuationId,
      jobDescription: {
        versionId: row.description_id,
        content: row.description_content,
      },
      methodology: toProviderMethodologyContext(row.methodology_definition),
    };
    const inputFingerprint = fingerprint({
      organizationId,
      valuationId,
      methodologyVersionId: row.methodology_version_id,
      jobDescriptionVersionId: row.description_id,
      descriptionContent: row.description_content,
      methodology: providerInput.methodology,
      promptVersion: this.promptVersion,
    });

    return {
      providerInput,
      methodology: row.methodology_definition,
      methodologyVersionId: row.methodology_version_id,
      jobDescriptionVersionId: row.description_id,
      inputFingerprint,
    };
  }

  private async persistCompletedRun(
    organizationId: string,
    valuationId: string,
    actorUserId: string,
    prepared: PreparedInput,
    result: ValidatedAIAssistanceResult,
  ): Promise<AIAssistanceRunSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT status, methodology_version_id, job_description_version_id
         FROM valuations
         WHERE organization_id = $1 AND id = $2
         FOR UPDATE`,
        [organizationId, valuationId],
      );
      const current = currentResult.rows[0] as
        | {
            status: string;
            methodology_version_id: string;
            job_description_version_id: string | null;
          }
        | undefined;
      if (current === undefined) {
        throw new AIAssistanceError(
          "AI_INPUT_CHANGED",
          "Valuation changed or disappeared while AI assistance was being prepared.",
        );
      }
      requireEditableStatus(current.status);
      if (
        current.methodology_version_id !== prepared.methodologyVersionId ||
        current.job_description_version_id !== prepared.jobDescriptionVersionId
      ) {
        throw new AIAssistanceError(
          "AI_INPUT_CHANGED",
          "Valuation inputs changed while AI assistance was being prepared.",
        );
      }

      const runResult = await client.query(
        `INSERT INTO ai_assistance_runs
          (organization_id, valuation_id, methodology_version_id, job_description_version_id,
           provider_id, model_id, prompt_version, input_fingerprint, status,
           created_by_user_id, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETED', $9, now())
         RETURNING id, organization_id, valuation_id, methodology_version_id,
                   job_description_version_id, provider_id, model_id, prompt_version,
                   input_fingerprint, status, created_by_user_id, created_at, completed_at`,
        [
          organizationId,
          valuationId,
          prepared.methodologyVersionId,
          prepared.jobDescriptionVersionId,
          this.provider.providerId.trim(),
          normalizeOptional(this.provider.modelId),
          this.promptVersion.trim(),
          prepared.inputFingerprint,
          actorUserId,
        ],
      );
      const run = runResult.rows[0] as RunRow;

      for (const suggestion of result.suggestions) {
        const suggestionResult = await client.query(
          `INSERT INTO ai_factor_suggestions
            (organization_id, run_id, dimension_code, suggested_level_code, confidence, rationale)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            organizationId,
            run.id,
            suggestion.dimensionCode,
            suggestion.suggestedLevelCode,
            suggestion.confidence,
            suggestion.rationale,
          ],
        );
        const suggestionId = suggestionResult.rows[0]!.id as string;
        for (const evidence of suggestion.evidence) {
          await client.query(
            `INSERT INTO ai_suggestion_evidence
              (organization_id, suggestion_id, job_description_version_id, source_section, excerpt)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              organizationId,
              suggestionId,
              prepared.jobDescriptionVersionId,
              evidence.sourceSection,
              evidence.excerpt,
            ],
          );
        }
      }

      for (const clarification of result.clarifications) {
        await client.query(
          `INSERT INTO ai_clarification_questions
            (organization_id, run_id, dimension_code, question_text, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            organizationId,
            run.id,
            clarification.dimensionCode,
            clarification.question,
            clarification.reason,
          ],
        );
      }

      await client.query(
        `INSERT INTO security_audit_events
          (organization_id, actor_user_id, action, resource_type, resource_id, payload)
         VALUES ($1, $2, 'AI_ASSISTANCE_RECORDED', 'AI_ASSISTANCE_RUN', $3,
           jsonb_build_object(
             'valuationId', $4::text,
             'providerId', $5::text,
             'modelId', $6::text,
             'promptVersion', $7::text,
             'suggestionCount', $8::int,
             'clarificationCount', $9::int
           ))`,
        [
          organizationId,
          actorUserId,
          run.id,
          valuationId,
          this.provider.providerId.trim(),
          normalizeOptional(this.provider.modelId),
          this.promptVersion.trim(),
          result.suggestions.length,
          result.clarifications.length,
        ],
      );

      await client.query("COMMIT");
      return hydrateRun(client, run);
    } catch (error) {
      await safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function hydrateRun(
  db: Pick<Pool, "query"> | Pick<PoolClient, "query">,
  run: RunRow,
): Promise<AIAssistanceRunSnapshot> {
  const suggestionsResult = await db.query(
    `SELECT id, dimension_code, suggested_level_code, confidence, rationale
     FROM ai_factor_suggestions
     WHERE organization_id = $1 AND run_id = $2
     ORDER BY dimension_code, id`,
    [run.organization_id, run.id],
  );
  const questionsResult = await db.query(
    `SELECT id, dimension_code, question_text, reason, status
     FROM ai_clarification_questions
     WHERE organization_id = $1 AND run_id = $2
     ORDER BY id`,
    [run.organization_id, run.id],
  );

  const suggestions: SavedAIFactorSuggestion[] = [];
  for (const row of suggestionsResult.rows as Array<{
    id: string;
    dimension_code: string;
    suggested_level_code: string | null;
    confidence: string | number | null;
    rationale: string;
  }>) {
    const evidenceResult = await db.query(
      `SELECT id, excerpt, source_section
       FROM ai_suggestion_evidence
       WHERE organization_id = $1 AND suggestion_id = $2
       ORDER BY id`,
      [run.organization_id, row.id],
    );
    suggestions.push({
      id: row.id,
      dimensionCode: row.dimension_code,
      suggestedLevelCode: row.suggested_level_code,
      confidence: row.confidence === null ? null : Number(row.confidence),
      rationale: row.rationale,
      evidence: evidenceResult.rows.map((evidence) => ({
        id: evidence.id as string,
        excerpt: evidence.excerpt as string,
        sourceSection: evidence.source_section as string | null,
      })),
    });
  }

  return {
    id: run.id,
    organizationId: run.organization_id,
    valuationId: run.valuation_id,
    methodologyVersionId: run.methodology_version_id,
    jobDescriptionVersionId: run.job_description_version_id,
    providerId: run.provider_id,
    modelId: run.model_id,
    promptVersion: run.prompt_version,
    inputFingerprint: run.input_fingerprint,
    status: run.status,
    createdByUserId: run.created_by_user_id,
    createdAt: run.created_at,
    completedAt: run.completed_at,
    suggestions,
    clarifications: questionsResult.rows.map((question) => ({
      id: question.id as string,
      dimensionCode: question.dimension_code as string | null,
      question: question.question_text as string,
      reason: question.reason as string,
      status: question.status as "OPEN" | "ANSWERED" | "DISMISSED",
    })),
  };
}

function requireEditableStatus(status: string): void {
  if (status !== "DRAFT" && status !== "RETURNED") {
    throw new AIAssistanceError(
      "AI_VALUATION_NOT_EDITABLE",
      `AI assistance can only be generated for DRAFT or RETURNED valuations; current status is ${status}.`,
    );
  }
}

function validateProviderMetadata(provider: AIAssistanceProvider, promptVersion: string): void {
  const providerId = provider.providerId.trim();
  const modelId = normalizeOptional(provider.modelId);
  const prompt = promptVersion.trim();
  if (
    providerId === "" ||
    providerId.length > PROVIDER_ID_MAX ||
    (modelId !== null && modelId.length > MODEL_ID_MAX) ||
    prompt === "" ||
    prompt.length > PROMPT_VERSION_MAX
  ) {
    throw new AIAssistanceError(
      "AI_PROVIDER_METADATA_INVALID",
      "AI provider metadata or prompt version is invalid.",
    );
  }
}

function normalizeOptional(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original error; rollback failure is observable in database logs.
  }
}
