import type { Pool } from "pg";
import type { AIAssistanceProviderBinding } from "../ai/provider-binding.js";
import {
  AIGovernanceService,
  type AIAssistanceSettings,
} from "./ai-governance-service.js";
import {
  AIAssistanceService,
  type AIAssistanceRunSnapshot,
  type SavedAIFactorSuggestion,
} from "./ai-assistance-service.js";
import {
  AIAssistanceResolutionService,
  type AIFactorSuggestionResolution,
  type AIAssistanceResolutionResult,
} from "./ai-assistance-resolution-service.js";
import type { AIAssistanceResolutionInput } from "../ai/resolution.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AIAssistanceWorkflowErrorCode =
  | "AI_WORKFLOW_VALUATION_NOT_FOUND"
  | "AI_WORKFLOW_SUGGESTION_NOT_FOUND"
  | "AI_ASSISTANCE_DISABLED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_EXTERNAL_PROCESSING_NOT_ALLOWED";

export class AIAssistanceWorkflowError extends Error {
  constructor(
    public readonly code: AIAssistanceWorkflowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AIAssistanceWorkflowError";
  }
}

export interface AIAssistanceProviderStatus {
  available: boolean;
  displayName: string | null;
  processingMode: "LOCAL" | "EXTERNAL" | null;
  testFixture: boolean;
}

export interface AIAssistanceRunWithResolutions {
  run: AIAssistanceRunSnapshot;
  resolutions: Record<string, AIFactorSuggestionResolution>;
}

export interface AIAssistanceWorkflowState {
  settings: AIAssistanceSettings;
  provider: AIAssistanceProviderStatus;
  latest: AIAssistanceRunWithResolutions | null;
}

/**
 * Application boundary joining tenant governance to the provider-neutral
 * generation/resolution services. It never relaxes the deterministic valuation
 * rules: generation remains suggestion-only and resolution remains explicitly human.
 */
export class AIAssistanceWorkflowService {
  private readonly governance: AIGovernanceService;
  private readonly resolution: AIAssistanceResolutionService;

  constructor(
    private readonly pool: Pool,
    private readonly binding: AIAssistanceProviderBinding | null,
  ) {
    this.governance = new AIGovernanceService(pool);
    this.resolution = new AIAssistanceResolutionService(pool);
  }

  async getState(
    organizationId: string,
    valuationId: string,
  ): Promise<AIAssistanceWorkflowState> {
    if (!UUID_PATTERN.test(valuationId)) {
      throw valuationNotFound();
    }

    const valuation = await this.pool.query(
      `SELECT id FROM valuations WHERE organization_id = $1 AND id = $2`,
      [organizationId, valuationId],
    );
    if (valuation.rows.length === 0) throw valuationNotFound();

    const settings = await this.governance.getSettings(organizationId);
    const latest = await loadLatestRun(this.pool, organizationId, valuationId);
    return {
      settings,
      provider: bindingStatus(this.binding),
      latest,
    };
  }

  async generate(
    organizationId: string,
    valuationId: string,
    actorUserId: string,
  ): Promise<AIAssistanceRunSnapshot> {
    if (!UUID_PATTERN.test(valuationId)) throw valuationNotFound();
    const settings = await this.requireEnabled(organizationId);
    if (this.binding === null) {
      throw new AIAssistanceWorkflowError(
        "AI_PROVIDER_UNAVAILABLE",
        "No AI assistance provider is configured for this environment.",
      );
    }
    if (this.binding.processingMode === "EXTERNAL" && !settings.externalProcessingAllowed) {
      throw new AIAssistanceWorkflowError(
        "AI_EXTERNAL_PROCESSING_NOT_ALLOWED",
        "This organization has not allowed external processing for AI assistance.",
      );
    }

    return new AIAssistanceService(
      this.pool,
      this.binding.provider,
      this.binding.promptVersion,
    ).generate(organizationId, valuationId, actorUserId);
  }

  async resolve(
    organizationId: string,
    valuationId: string,
    suggestionId: string,
    actorUserId: string,
    input: AIAssistanceResolutionInput,
  ): Promise<AIAssistanceResolutionResult> {
    if (!UUID_PATTERN.test(valuationId)) throw valuationNotFound();
    if (!UUID_PATTERN.test(suggestionId)) throw suggestionNotFound();
    await this.requireEnabled(organizationId);

    const relation = await this.pool.query(
      `SELECT 1
       FROM ai_factor_suggestions s
       JOIN ai_assistance_runs r
         ON r.id = s.run_id
        AND r.organization_id = s.organization_id
       WHERE s.organization_id = $1
         AND s.id = $2
         AND r.valuation_id = $3`,
      [organizationId, suggestionId, valuationId],
    );
    if (relation.rows.length === 0) throw suggestionNotFound();

    return this.resolution.resolve(organizationId, suggestionId, actorUserId, input);
  }

  private async requireEnabled(organizationId: string): Promise<AIAssistanceSettings> {
    const settings = await this.governance.getSettings(organizationId);
    if (!settings.assistanceEnabled) {
      throw new AIAssistanceWorkflowError(
        "AI_ASSISTANCE_DISABLED",
        "AI assistance is disabled for this organization.",
      );
    }
    return settings;
  }
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

async function loadLatestRun(
  pool: Pool,
  organizationId: string,
  valuationId: string,
): Promise<AIAssistanceRunWithResolutions | null> {
  const result = await pool.query(
    `SELECT id, organization_id, valuation_id, methodology_version_id,
            job_description_version_id, provider_id, model_id, prompt_version,
            input_fingerprint, status, created_by_user_id, created_at, completed_at
     FROM ai_assistance_runs
     WHERE organization_id = $1 AND valuation_id = $2
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [organizationId, valuationId],
  );
  const row = result.rows[0] as RunRow | undefined;
  if (row === undefined) return null;

  const suggestionsResult = await pool.query(
    `SELECT id, dimension_code, suggested_level_code, confidence, rationale
     FROM ai_factor_suggestions
     WHERE organization_id = $1 AND run_id = $2
     ORDER BY dimension_code, id`,
    [organizationId, row.id],
  );
  const suggestions: SavedAIFactorSuggestion[] = [];
  for (const suggestion of suggestionsResult.rows as Array<{
    id: string;
    dimension_code: string;
    suggested_level_code: string | null;
    confidence: number | string | null;
    rationale: string;
  }>) {
    const evidence = await pool.query(
      `SELECT id, excerpt, source_section
       FROM ai_suggestion_evidence
       WHERE organization_id = $1 AND suggestion_id = $2
       ORDER BY id`,
      [organizationId, suggestion.id],
    );
    suggestions.push({
      id: suggestion.id,
      dimensionCode: suggestion.dimension_code,
      suggestedLevelCode: suggestion.suggested_level_code,
      confidence: suggestion.confidence === null ? null : Number(suggestion.confidence),
      rationale: suggestion.rationale,
      evidence: evidence.rows.map((item) => ({
        id: item.id as string,
        excerpt: item.excerpt as string,
        sourceSection: item.source_section as string | null,
      })),
    });
  }

  const clarifications = await pool.query(
    `SELECT id, dimension_code, question_text, reason, status
     FROM ai_clarification_questions
     WHERE organization_id = $1 AND run_id = $2
     ORDER BY id`,
    [organizationId, row.id],
  );

  const resolutionResult = await pool.query(
    `SELECT rr.id, rr.organization_id, rr.suggestion_id, rr.resolution,
            rr.resolved_level_code, rr.note, rr.resolved_by_user_id, rr.created_at
     FROM ai_suggestion_resolutions rr
     JOIN ai_factor_suggestions s
       ON s.id = rr.suggestion_id
      AND s.organization_id = rr.organization_id
     WHERE rr.organization_id = $1 AND s.run_id = $2`,
    [organizationId, row.id],
  );
  const resolutions: Record<string, AIFactorSuggestionResolution> = {};
  for (const item of resolutionResult.rows) {
    const suggestionId = item.suggestion_id as string;
    resolutions[suggestionId] = {
      id: item.id as string,
      organizationId: item.organization_id as string,
      suggestionId,
      resolution: item.resolution as AIFactorSuggestionResolution["resolution"],
      resolvedLevelCode: item.resolved_level_code as string | null,
      note: item.note as string | null,
      resolvedByUserId: item.resolved_by_user_id as string,
      createdAt: item.created_at as Date,
    };
  }

  return {
    run: {
      id: row.id,
      organizationId: row.organization_id,
      valuationId: row.valuation_id,
      methodologyVersionId: row.methodology_version_id,
      jobDescriptionVersionId: row.job_description_version_id,
      providerId: row.provider_id,
      modelId: row.model_id,
      promptVersion: row.prompt_version,
      inputFingerprint: row.input_fingerprint,
      status: row.status,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      suggestions,
      clarifications: clarifications.rows.map((item) => ({
        id: item.id as string,
        dimensionCode: item.dimension_code as string | null,
        question: item.question_text as string,
        reason: item.reason as string,
        status: item.status as "OPEN" | "ANSWERED" | "DISMISSED",
      })),
    },
    resolutions,
  };
}

function bindingStatus(
  binding: AIAssistanceProviderBinding | null,
): AIAssistanceProviderStatus {
  if (binding === null) {
    return {
      available: false,
      displayName: null,
      processingMode: null,
      testFixture: false,
    };
  }
  return {
    available: true,
    displayName: binding.displayName,
    processingMode: binding.processingMode,
    testFixture: binding.testFixture,
  };
}

function valuationNotFound(): AIAssistanceWorkflowError {
  return new AIAssistanceWorkflowError(
    "AI_WORKFLOW_VALUATION_NOT_FOUND",
    "Valuation is not available in this organization.",
  );
}

function suggestionNotFound(): AIAssistanceWorkflowError {
  return new AIAssistanceWorkflowError(
    "AI_WORKFLOW_SUGGESTION_NOT_FOUND",
    "AI suggestion is not available for this valuation and organization.",
  );
}
