import type { MethodologyDefinition } from "../domain/methodology.js";
import { containsAnchoredEvidence } from "../domain/evidence.js";

export interface AIAssistanceMethodologyContext {
  code: string;
  name: string;
  version: string;
  factors: Array<{
    code: string;
    name: string;
    description: string | null;
    dimensions: Array<{
      code: string;
      name: string;
      description: string | null;
      required: boolean;
      levels: Array<{
        code: string;
        label: string;
        description: string | null;
      }>;
    }>;
  }>;
}

export interface AIAssistanceProviderInput {
  valuationId: string;
  jobDescription: {
    versionId: string;
    content: string;
  };
  methodology: AIAssistanceMethodologyContext;
}

export interface AIAssistanceProvider {
  readonly providerId: string;
  readonly modelId: string | null;
  analyze(input: AIAssistanceProviderInput): Promise<unknown>;
}

export interface ValidatedSuggestionEvidence {
  excerpt: string;
  sourceSection: string | null;
}

export interface ValidatedFactorSuggestion {
  dimensionCode: string;
  suggestedLevelCode: string | null;
  confidence: number | null;
  rationale: string;
  evidence: ValidatedSuggestionEvidence[];
}

export interface ValidatedClarificationQuestion {
  dimensionCode: string | null;
  question: string;
  reason: string;
}

export interface ValidatedAIAssistanceResult {
  suggestions: ValidatedFactorSuggestion[];
  clarifications: ValidatedClarificationQuestion[];
}

export type AIAssistanceValidationCode =
  | "AI_RESULT_INVALID"
  | "AI_RESULT_UNKNOWN_FIELD"
  | "AI_RESULT_EMPTY"
  | "AI_DUPLICATE_DIMENSION"
  | "AI_UNKNOWN_DIMENSION"
  | "AI_INVALID_LEVEL"
  | "AI_INVALID_CONFIDENCE"
  | "AI_EVIDENCE_NOT_IN_DESCRIPTION";

export class AIAssistanceValidationError extends Error {
  constructor(
    public readonly code: AIAssistanceValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "AIAssistanceValidationError";
  }
}

export function toProviderMethodologyContext(
  methodology: MethodologyDefinition,
): AIAssistanceMethodologyContext {
  return {
    code: methodology.code,
    name: methodology.name,
    version: methodology.version,
    factors: methodology.factors.map((factor) => ({
      code: factor.code,
      name: factor.name,
      description: factor.description ?? null,
      dimensions: factor.dimensions.map((dimension) => ({
        code: dimension.code,
        name: dimension.name,
        description: dimension.description ?? null,
        required: dimension.required,
        levels: dimension.levels.map((level) => ({
          code: level.code,
          label: level.label,
          description: level.description ?? null,
        })),
      })),
    })),
  };
}

export function validateAIAssistanceProviderResult(
  payload: unknown,
  methodology: MethodologyDefinition,
  jobDescriptionContent: string,
): ValidatedAIAssistanceResult {
  const root = plainObject(payload, "AI result");
  assertOnlyKeys(root, ["suggestions", "clarifications"], "AI result");

  const suggestionValues = arrayValue(root.suggestions, "suggestions");
  const clarificationValues = arrayValue(root.clarifications, "clarifications");
  if (suggestionValues.length === 0 && clarificationValues.length === 0) {
    throw new AIAssistanceValidationError(
      "AI_RESULT_EMPTY",
      "AI result must contain at least one suggestion or clarification question.",
    );
  }

  const dimensions = new Map(
    methodology.factors.flatMap((factor) => factor.dimensions).map((dimension) => [dimension.code, dimension]),
  );
  const seenSuggestionDimensions = new Set<string>();

  const suggestions = suggestionValues.map((value, index): ValidatedFactorSuggestion => {
    const item = plainObject(value, `suggestions[${index}]`);
    assertOnlyKeys(
      item,
      ["dimensionCode", "suggestedLevelCode", "confidence", "rationale", "evidence"],
      `suggestions[${index}]`,
    );
    const dimensionCode = requiredText(item.dimensionCode, `suggestions[${index}].dimensionCode`, 120);
    if (seenSuggestionDimensions.has(dimensionCode)) {
      throw new AIAssistanceValidationError(
        "AI_DUPLICATE_DIMENSION",
        `AI result contains more than one suggestion for dimension ${dimensionCode}.`,
      );
    }
    seenSuggestionDimensions.add(dimensionCode);

    const dimension = dimensions.get(dimensionCode);
    if (dimension === undefined) {
      throw new AIAssistanceValidationError(
        "AI_UNKNOWN_DIMENSION",
        `AI result references unknown dimension ${dimensionCode}.`,
      );
    }

    const suggestedLevelCode = nullableText(
      item.suggestedLevelCode,
      `suggestions[${index}].suggestedLevelCode`,
      120,
    );
    if (
      suggestedLevelCode !== null &&
      !dimension.levels.some((level) => level.code === suggestedLevelCode)
    ) {
      throw new AIAssistanceValidationError(
        "AI_INVALID_LEVEL",
        `Level ${suggestedLevelCode} does not belong to dimension ${dimensionCode}.`,
      );
    }

    const confidence = nullableConfidence(item.confidence, `suggestions[${index}].confidence`);
    const rationale = requiredText(item.rationale, `suggestions[${index}].rationale`, 5000);
    const evidence = arrayValue(item.evidence, `suggestions[${index}].evidence`).map(
      (evidenceValue, evidenceIndex): ValidatedSuggestionEvidence => {
        const evidenceItem = plainObject(
          evidenceValue,
          `suggestions[${index}].evidence[${evidenceIndex}]`,
        );
        assertOnlyKeys(
          evidenceItem,
          ["excerpt", "sourceSection"],
          `suggestions[${index}].evidence[${evidenceIndex}]`,
        );
        const excerpt = requiredText(
          evidenceItem.excerpt,
          `suggestions[${index}].evidence[${evidenceIndex}].excerpt`,
          4000,
        );
        if (!containsAnchoredEvidence(jobDescriptionContent, excerpt)) {
          throw new AIAssistanceValidationError(
            "AI_EVIDENCE_NOT_IN_DESCRIPTION",
            `Evidence for dimension ${dimensionCode} is not contained in the pinned job description.`,
          );
        }
        return {
          excerpt,
          sourceSection: nullableText(
            evidenceItem.sourceSection,
            `suggestions[${index}].evidence[${evidenceIndex}].sourceSection`,
            500,
          ),
        };
      },
    );

    return {
      dimensionCode,
      suggestedLevelCode,
      confidence,
      rationale,
      evidence,
    };
  });

  const clarifications = clarificationValues.map(
    (value, index): ValidatedClarificationQuestion => {
      const item = plainObject(value, `clarifications[${index}]`);
      assertOnlyKeys(item, ["dimensionCode", "question", "reason"], `clarifications[${index}]`);
      const dimensionCode = nullableText(
        item.dimensionCode,
        `clarifications[${index}].dimensionCode`,
        120,
      );
      if (dimensionCode !== null && !dimensions.has(dimensionCode)) {
        throw new AIAssistanceValidationError(
          "AI_UNKNOWN_DIMENSION",
          `Clarification references unknown dimension ${dimensionCode}.`,
        );
      }
      return {
        dimensionCode,
        question: requiredText(item.question, `clarifications[${index}].question`, 2000),
        reason: requiredText(item.reason, `clarifications[${index}].reason`, 2000),
      };
    },
  );

  return { suggestions, clarifications };
}

function plainObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(`${path} must be an array.`);
  return value;
}

function requiredText(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== "string") throw invalid(`${path} must be a string.`);
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxLength) {
    throw invalid(`${path} must contain 1-${maxLength} characters.`);
  }
  return trimmed;
}

function nullableText(value: unknown, path: string, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  return requiredText(value, path, maxLength);
}

function nullableConfidence(value: unknown, path: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new AIAssistanceValidationError(
      "AI_INVALID_CONFIDENCE",
      `${path} must be a finite number between 0 and 1 or null.`,
    );
  }
  return value;
}

function assertOnlyKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(object).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new AIAssistanceValidationError(
      "AI_RESULT_UNKNOWN_FIELD",
      `${path} contains unsupported fields: ${unknown.join(", ")}.`,
    );
  }
}

function invalid(message: string): AIAssistanceValidationError {
  return new AIAssistanceValidationError("AI_RESULT_INVALID", message);
}
