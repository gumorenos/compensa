import type { Pool, PoolClient } from "pg";
import {
  validateAIAssistanceResolutionInput,
  type AIAssistanceResolution,
  type AIAssistanceResolutionInput,
} from "../ai/resolution.js";
import {
  CompensaRepository,
  PersistenceError,
} from "../persistence/database.js";
import {
  ValuationService,
  type ValuationSnapshot,
} from "./valuation-service.js";

export type AIAssistanceResolutionErrorCode =
  | "AI_SUGGESTION_NOT_FOUND"
  | "AI_SUGGESTION_ALREADY_RESOLVED"
  | "AI_SUGGESTION_NOT_EDITABLE"
  | "AI_SUGGESTION_STALE"
  | "AI_SUGGESTION_HAS_NO_LEVEL"
  | "AI_RESOLUTION_NOT_MODIFIED"
  | "AI_RESOLUTION_INVALID_LEVEL";

export class AIAssistanceResolutionError extends Error {
  constructor(
    public readonly code: AIAssistanceResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AIAssistanceResolutionError";
  }
}

export interface AIFactorSuggestionResolution {
  id: string;
  organizationId: string;
  suggestionId: string;
  resolution: AIAssistanceResolution;
  resolvedLevelCode: string | null;
  note: string | null;
  resolvedByUserId: string;
  createdAt: Date;
}

export interface AIAssistanceResolutionResult {
  resolution: AIFactorSuggestionResolution;
  valuation: ValuationSnapshot | null;
}

interface SuggestionContextRow {
  suggestion_id: string;
  dimension_code: string;
  suggested_level_code: string | null;
  run_id: string;
  valuation_id: string;
  run_methodology_version_id: string;
  run_job_description_version_id: string;
  valuation_methodology_version_id: string;
  valuation_job_description_version_id: string | null;
  valuation_status: string;
  resolution_id: string | null;
}

interface ResolutionRow {
  id: string;
  organization_id: string;
  suggestion_id: string;
  resolution: AIAssistanceResolution;
  resolved_level_code: string | null;
  note: string | null;
  resolved_by_user_id: string;
  created_at: Date;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies an explicit human decision to one persisted AI suggestion.
 *
 * The original AI run/suggestion remains immutable. ACCEPTED/MODIFIED reuse the
 * existing deterministic ValuationService inside the same PostgreSQL transaction;
 * REJECTED never writes a valuation decision or score.
 *
 * Authorization is intentionally not implemented here. Any web/runtime surface
 * invoking this service must require the existing EVALUATE permission.
 */
export class AIAssistanceResolutionService {
  constructor(private readonly pool: Pool) {}

  async resolve(
    organizationId: string,
    suggestionId: string,
    actorUserId: string,
    input: AIAssistanceResolutionInput,
  ): Promise<AIAssistanceResolutionResult> {
    // suggestionId will normally come from a URL/form boundary. Reject malformed UUIDs
    // before PostgreSQL has a chance to cast the parameter.
    if (!UUID_PATTERN.test(suggestionId)) {
      throw new AIAssistanceResolutionError(
        "AI_SUGGESTION_NOT_FOUND",
        "AI suggestion is not available in this organization.",
      );
    }
    const request = validateAIAssistanceResolutionInput(input);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const initial = await findSuggestionContext(client, organizationId, suggestionId, false);
      if (initial === null) {
        throw notFound();
      }

      // Keep lock ordering aligned with ValuationService.saveDecision. This serializes
      // human resolution with manual edits to the same valuation and avoids a row-lock /
      // advisory-lock inversion under concurrency.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `valuation-edit:${initial.valuation_id}`,
      ]);

      const context = await findSuggestionContext(client, organizationId, suggestionId, true);
      if (context === null) {
        throw notFound();
      }
      if (context.resolution_id !== null) {
        throw new AIAssistanceResolutionError(
          "AI_SUGGESTION_ALREADY_RESOLVED",
          "AI suggestion already has an immutable human resolution.",
        );
      }
      if (context.valuation_status !== "DRAFT" && context.valuation_status !== "RETURNED") {
        throw new AIAssistanceResolutionError(
          "AI_SUGGESTION_NOT_EDITABLE",
          `AI suggestion cannot be resolved while valuation is ${context.valuation_status}.`,
        );
      }
      if (
        context.valuation_methodology_version_id !== context.run_methodology_version_id ||
        context.valuation_job_description_version_id !== context.run_job_description_version_id
      ) {
        throw new AIAssistanceResolutionError(
          "AI_SUGGESTION_STALE",
          "AI suggestion no longer matches the valuation inputs it was generated from.",
        );
      }

      const resolvedLevelCode = resolveHumanLevel(context, request.resolution, request.resolvedLevelCode);
      let valuation: ValuationSnapshot | null = null;

      if (request.resolution !== "REJECTED") {
        const transactionRepository = new TransactionBoundRepository(this.pool, client);
        const valuationService = new ValuationService(transactionRepository);
        try {
          valuation = await valuationService.saveDecision(
            organizationId,
            context.valuation_id,
            {
              dimensionCode: context.dimension_code,
              selectedLevelCode: resolvedLevelCode!,
              source: request.resolution === "ACCEPTED" ? "AI_ACCEPTED" : "AI_MODIFIED",
              justification: request.justification,
            },
          );
        } catch (error) {
          if (error instanceof PersistenceError && error.code === "INVALID_LEVEL") {
            throw new AIAssistanceResolutionError(
              "AI_RESOLUTION_INVALID_LEVEL",
              "Resolved level is not valid for this valuation dimension.",
            );
          }
          throw error;
        }
      }

      const resolutionResult = await client.query(
        `INSERT INTO ai_suggestion_resolutions
          (organization_id, suggestion_id, resolution, resolved_level_code, note, resolved_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, organization_id, suggestion_id, resolution, resolved_level_code,
                   note, resolved_by_user_id, created_at`,
        [
          organizationId,
          suggestionId,
          request.resolution,
          resolvedLevelCode,
          request.note,
          actorUserId,
        ],
      );
      const resolution = mapResolution(resolutionResult.rows[0] as ResolutionRow);

      await client.query(
        `INSERT INTO valuation_events
          (organization_id, valuation_id, action, payload, actor_user_id)
         VALUES ($1, $2, 'AI_SUGGESTION_RESOLVED', $3::jsonb, $4)`,
        [
          organizationId,
          context.valuation_id,
          JSON.stringify({
            suggestionId,
            runId: context.run_id,
            dimensionCode: context.dimension_code,
            resolution: request.resolution,
            resolvedLevelCode,
          }),
          actorUserId,
        ],
      );

      await client.query(
        `INSERT INTO security_audit_events
          (organization_id, actor_user_id, action, resource_type, resource_id, payload)
         VALUES ($1, $2, 'AI_SUGGESTION_RESOLVED', 'AI_FACTOR_SUGGESTION', $3,
           jsonb_build_object(
             'runId', $4::text,
             'valuationId', $5::text,
             'dimensionCode', $6::text,
             'resolution', $7::text,
             'resolvedLevelCode', $8::text
           ))`,
        [
          organizationId,
          actorUserId,
          suggestionId,
          context.run_id,
          context.valuation_id,
          context.dimension_code,
          request.resolution,
          resolvedLevelCode,
        ],
      );

      await client.query("COMMIT");
      return { resolution, valuation };
    } catch (error) {
      await safeRollback(client);
      if (isUniqueViolation(error)) {
        throw new AIAssistanceResolutionError(
          "AI_SUGGESTION_ALREADY_RESOLVED",
          "AI suggestion already has an immutable human resolution.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getResolution(
    organizationId: string,
    suggestionId: string,
  ): Promise<AIFactorSuggestionResolution | null> {
    if (!UUID_PATTERN.test(suggestionId)) return null;
    const result = await this.pool.query(
      `SELECT id, organization_id, suggestion_id, resolution, resolved_level_code,
              note, resolved_by_user_id, created_at
       FROM ai_suggestion_resolutions
       WHERE organization_id = $1 AND suggestion_id = $2`,
      [organizationId, suggestionId],
    );
    const row = result.rows[0] as ResolutionRow | undefined;
    return row === undefined ? null : mapResolution(row);
  }
}

class TransactionBoundRepository extends CompensaRepository {
  constructor(
    pool: Pool,
    private readonly transactionClient: PoolClient,
  ) {
    super(pool);
  }

  override async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    // The outer AI-resolution service owns BEGIN/COMMIT/ROLLBACK. Reusing the same
    // client keeps the human decision, deterministic recalculation and resolution
    // audit atomic without duplicating the scoring workflow.
    return callback(this.transactionClient);
  }
}

async function findSuggestionContext(
  client: PoolClient,
  organizationId: string,
  suggestionId: string,
  lock: boolean,
): Promise<SuggestionContextRow | null> {
  const result = await client.query(
    `SELECT
       s.id AS suggestion_id,
       s.dimension_code,
       s.suggested_level_code,
       r.id AS run_id,
       r.valuation_id,
       r.methodology_version_id AS run_methodology_version_id,
       r.job_description_version_id AS run_job_description_version_id,
       v.methodology_version_id AS valuation_methodology_version_id,
       v.job_description_version_id AS valuation_job_description_version_id,
       v.status AS valuation_status,
       rr.id AS resolution_id
     FROM ai_factor_suggestions s
     JOIN ai_assistance_runs r
       ON r.id = s.run_id
      AND r.organization_id = s.organization_id
     JOIN valuations v
       ON v.id = r.valuation_id
      AND v.organization_id = r.organization_id
     LEFT JOIN ai_suggestion_resolutions rr
       ON rr.suggestion_id = s.id
      AND rr.organization_id = s.organization_id
     WHERE s.organization_id = $1
       AND s.id = $2
     ${lock ? "FOR UPDATE OF s, v" : ""}`,
    [organizationId, suggestionId],
  );
  return (result.rows[0] as SuggestionContextRow | undefined) ?? null;
}

function resolveHumanLevel(
  context: SuggestionContextRow,
  resolution: AIAssistanceResolution,
  requestedLevel: string | null,
): string | null {
  if (resolution === "REJECTED") return null;
  if (resolution === "ACCEPTED") {
    if (context.suggested_level_code === null) {
      throw new AIAssistanceResolutionError(
        "AI_SUGGESTION_HAS_NO_LEVEL",
        "An AI abstention has no level to accept. Modify it with an explicit human level or reject it.",
      );
    }
    return context.suggested_level_code;
  }

  if (requestedLevel === null) {
    // Runtime validation should make this unreachable, but keep the invariant local.
    throw new AIAssistanceResolutionError(
      "AI_RESOLUTION_INVALID_LEVEL",
      "A modified AI suggestion requires an explicit human level.",
    );
  }
  if (context.suggested_level_code !== null && requestedLevel === context.suggested_level_code) {
    throw new AIAssistanceResolutionError(
      "AI_RESOLUTION_NOT_MODIFIED",
      "Use ACCEPTED when the human choice matches the AI suggestion exactly.",
    );
  }
  return requestedLevel;
}

function mapResolution(row: ResolutionRow): AIFactorSuggestionResolution {
  return {
    id: row.id,
    organizationId: row.organization_id,
    suggestionId: row.suggestion_id,
    resolution: row.resolution,
    resolvedLevelCode: row.resolved_level_code,
    note: row.note,
    resolvedByUserId: row.resolved_by_user_id,
    createdAt: row.created_at,
  };
}

function notFound(): AIAssistanceResolutionError {
  return new AIAssistanceResolutionError(
    "AI_SUGGESTION_NOT_FOUND",
    "AI suggestion is not available in this organization.",
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original failure.
  }
}
