export type AIAssistanceResolution = "ACCEPTED" | "MODIFIED" | "REJECTED";

export type AIAssistanceResolutionInput =
  | {
      resolution: "ACCEPTED";
      note?: string | null;
      justification?: string | null;
    }
  | {
      resolution: "MODIFIED";
      resolvedLevelCode: string;
      note?: string | null;
      justification?: string | null;
    }
  | {
      resolution: "REJECTED";
      note?: string | null;
    };

export interface ValidatedAIAssistanceResolutionInput {
  resolution: AIAssistanceResolution;
  resolvedLevelCode: string | null;
  note: string | null;
  justification: string | null;
}

export type AIAssistanceResolutionValidationCode =
  | "AI_RESOLUTION_INVALID"
  | "AI_RESOLUTION_UNKNOWN_FIELD";

export class AIAssistanceResolutionValidationError extends Error {
  constructor(
    public readonly code: AIAssistanceResolutionValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "AIAssistanceResolutionValidationError";
  }
}

export function validateAIAssistanceResolutionInput(
  input: unknown,
): ValidatedAIAssistanceResolutionInput {
  const root = plainObject(input);
  assertOnlyKeys(root, ["resolution", "resolvedLevelCode", "note", "justification"]);

  const resolution = root.resolution;
  if (resolution !== "ACCEPTED" && resolution !== "MODIFIED" && resolution !== "REJECTED") {
    throw invalid("resolution must be ACCEPTED, MODIFIED or REJECTED.");
  }

  const note = optionalText(root.note, "note", 2000);

  if (resolution === "ACCEPTED") {
    if (root.resolvedLevelCode !== undefined && root.resolvedLevelCode !== null) {
      throw invalid("ACCEPTED does not accept a client-provided level; the persisted AI level is used.");
    }
    return {
      resolution,
      resolvedLevelCode: null,
      note,
      justification: optionalText(root.justification, "justification", 5000),
    };
  }

  if (resolution === "MODIFIED") {
    return {
      resolution,
      resolvedLevelCode: requiredText(root.resolvedLevelCode, "resolvedLevelCode", 120),
      note,
      justification: optionalText(root.justification, "justification", 5000),
    };
  }

  if (root.resolvedLevelCode !== undefined && root.resolvedLevelCode !== null) {
    throw invalid("REJECTED cannot persist a resolved level.");
  }
  if (root.justification !== undefined && root.justification !== null) {
    throw invalid("REJECTED cannot write a valuation-decision justification.");
  }

  return {
    resolution,
    resolvedLevelCode: null,
    note,
    justification: null,
  };
}

function plainObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("AI suggestion resolution must be an object.");
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(object: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(object).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new AIAssistanceResolutionValidationError(
      "AI_RESOLUTION_UNKNOWN_FIELD",
      `AI suggestion resolution contains unsupported fields: ${unknown.join(", ")}.`,
    );
  }
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw invalid(`${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized === "" || normalized.length > maxLength) {
    throw invalid(`${field} must contain 1-${maxLength} characters.`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw invalid(`${field} must be a string or null.`);
  }
  const normalized = value.trim();
  if (normalized === "") return null;
  if (normalized.length > maxLength) {
    throw invalid(`${field} must contain at most ${maxLength} characters.`);
  }
  return normalized;
}

function invalid(message: string): AIAssistanceResolutionValidationError {
  return new AIAssistanceResolutionValidationError("AI_RESOLUTION_INVALID", message);
}
