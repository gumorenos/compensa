import type {
  ConstantReference,
  DimensionDefinition,
  FactorDefinition,
  GradeDefinition,
  LevelDefinition,
  LookupInputReference,
  MethodologyDefinition,
  NumericReference,
  ScoringDefinition,
  ScoringStep,
} from "../domain/methodology.js";
import { validateMethodology } from "../domain/scoring-engine.js";

export interface MethodologyImportIssue {
  code: string;
  message: string;
  path?: string | undefined;
}

export interface MethodologyImportPreview {
  status: "VALID" | "INVALID";
  definition: MethodologyDefinition | null;
  issues: MethodologyImportIssue[];
  factorCount: number;
  dimensionCount: number;
  levelCount: number;
  gradeCount: number;
  scoringStepCount: number;
}

class StructuralMethodologyError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "StructuralMethodologyError";
  }
}

export function previewMethodologyImport(input: unknown): MethodologyImportPreview {
  let definition: MethodologyDefinition;
  try {
    definition = parseMethodologyDefinition(input);
  } catch (error) {
    if (error instanceof StructuralMethodologyError) {
      return {
        status: "INVALID",
        definition: null,
        issues: [{ code: "INVALID_METHODOLOGY_DOCUMENT", message: error.message, path: error.path }],
        factorCount: 0,
        dimensionCount: 0,
        levelCount: 0,
        gradeCount: 0,
        scoringStepCount: 0,
      };
    }
    throw error;
  }

  const issues = validateMethodology(definition).map((item) => ({
    code: item.code,
    message: item.message,
    ...(item.path === undefined ? {} : { path: item.path }),
  }));
  const dimensions = definition.factors.flatMap((factor) => factor.dimensions);
  const levelCount = dimensions.reduce((total, dimension) => total + dimension.levels.length, 0);

  return {
    status: issues.length === 0 ? "VALID" : "INVALID",
    definition,
    issues,
    factorCount: definition.factors.length,
    dimensionCount: dimensions.length,
    levelCount,
    gradeCount: definition.grades.length,
    scoringStepCount: definition.scoring.steps.length,
  };
}

export function parseMethodologyDefinition(input: unknown): MethodologyDefinition {
  const root = record(input, "$");
  const factorsValue = array(root.factors, "$.factors");
  if (factorsValue.length === 0) invalid("$.factors", "At least one factor is required.");
  const gradesValue = array(root.grades, "$.grades");
  if (gradesValue.length === 0) invalid("$.grades", "At least one grade is required.");

  return {
    code: text(root.code, "$.code"),
    name: text(root.name, "$.name"),
    version: text(root.version, "$.version"),
    factors: factorsValue.map((value, index) => parseFactor(value, `$.factors[${index}]`)),
    scoring: parseScoring(root.scoring, "$.scoring"),
    grades: gradesValue.map((value, index) => parseGrade(value, `$.grades[${index}]`)),
  };
}

function parseFactor(input: unknown, path: string): FactorDefinition {
  const value = record(input, path);
  const dimensionsValue = array(value.dimensions, `${path}.dimensions`);
  if (dimensionsValue.length === 0) invalid(`${path}.dimensions`, "At least one dimension is required.");
  const description = optionalText(value.description, `${path}.description`);
  return {
    code: text(value.code, `${path}.code`),
    name: text(value.name, `${path}.name`),
    ...(description === undefined ? {} : { description }),
    dimensions: dimensionsValue.map((item, index) =>
      parseDimension(item, `${path}.dimensions[${index}]`),
    ),
  };
}

function parseDimension(input: unknown, path: string): DimensionDefinition {
  const value = record(input, path);
  const levelsValue = array(value.levels, `${path}.levels`);
  if (levelsValue.length === 0) invalid(`${path}.levels`, "At least one level is required.");
  const description = optionalText(value.description, `${path}.description`);
  if (typeof value.required !== "boolean") invalid(`${path}.required`, "required must be boolean.");
  return {
    code: text(value.code, `${path}.code`),
    name: text(value.name, `${path}.name`),
    ...(description === undefined ? {} : { description }),
    required: value.required,
    levels: levelsValue.map((item, index) => parseLevel(item, `${path}.levels[${index}]`)),
  };
}

function parseLevel(input: unknown, path: string): LevelDefinition {
  const value = record(input, path);
  const description = optionalText(value.description, `${path}.description`);
  return {
    code: text(value.code, `${path}.code`),
    label: text(value.label, `${path}.label`),
    ...(description === undefined ? {} : { description }),
  };
}

function parseGrade(input: unknown, path: string): GradeDefinition {
  const value = record(input, path);
  return {
    code: text(value.code, `${path}.code`),
    name: text(value.name, `${path}.name`),
    minPoints: finiteNumber(value.minPoints, `${path}.minPoints`),
    maxPoints: finiteNumber(value.maxPoints, `${path}.maxPoints`),
  };
}

function parseScoring(input: unknown, path: string): ScoringDefinition {
  const value = record(input, path);
  const stepsValue = array(value.steps, `${path}.steps`);
  if (stepsValue.length === 0) invalid(`${path}.steps`, "At least one scoring step is required.");
  return {
    steps: stepsValue.map((item, index) => parseStep(item, `${path}.steps[${index}]`)),
    totalStep: text(value.totalStep, `${path}.totalStep`),
  };
}

function parseStep(input: unknown, path: string): ScoringStep {
  const value = record(input, path);
  const code = text(value.code, `${path}.code`);
  const label = optionalText(value.label, `${path}.label`);
  const type = text(value.type, `${path}.type`);
  const base = label === undefined ? { code } : { code, label };

  switch (type) {
    case "lookup": {
      const inputs = array(value.inputs, `${path}.inputs`).map((item, index) =>
        parseLookupReference(item, `${path}.inputs[${index}]`),
      );
      const tableValue = record(value.table, `${path}.table`);
      const table: Record<string, number> = {};
      for (const [key, raw] of Object.entries(tableValue)) {
        table[key] = finiteNumber(raw, `${path}.table.${key}`);
      }
      return { ...base, type, inputs, table };
    }
    case "sum":
    case "multiply":
      return {
        ...base,
        type,
        operands: array(value.operands, `${path}.operands`).map((item, index) =>
          parseNumericReference(item, `${path}.operands[${index}]`),
        ),
      };
    case "divide":
      return {
        ...base,
        type,
        numerator: parseNumericReference(value.numerator, `${path}.numerator`),
        denominator: parseNumericReference(value.denominator, `${path}.denominator`),
      };
    case "round":
      return {
        ...base,
        type,
        value: parseNumericReference(value.value, `${path}.value`),
        precision: finiteNumber(value.precision, `${path}.precision`),
      };
    default:
      invalid(`${path}.type`, "type must be lookup, sum, multiply, divide or round.");
  }
}

function parseLookupReference(input: unknown, path: string): LookupInputReference {
  const value = record(input, path);
  const kind = text(value.kind, `${path}.kind`);
  if (kind === "selection") {
    return { kind, dimension: text(value.dimension, `${path}.dimension`) };
  }
  if (kind === "step") {
    return { kind, step: text(value.step, `${path}.step`) };
  }
  invalid(`${path}.kind`, "lookup reference kind must be selection or step.");
}

function parseNumericReference(input: unknown, path: string): NumericReference {
  const value = record(input, path);
  const kind = text(value.kind, `${path}.kind`);
  if (kind === "step") {
    return { kind, step: text(value.step, `${path}.step`) };
  }
  if (kind === "constant") {
    const reference: ConstantReference = {
      kind,
      value: finiteNumber(value.value, `${path}.value`),
    };
    return reference;
  }
  invalid(`${path}.kind`, "numeric reference kind must be step or constant.");
}

function record(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    invalid(path, "Expected an object.");
  }
  return input as Record<string, unknown>;
}

function array(input: unknown, path: string): unknown[] {
  if (!Array.isArray(input)) invalid(path, "Expected an array.");
  return input;
}

function text(input: unknown, path: string): string {
  if (typeof input !== "string" || input.trim() === "") invalid(path, "Expected a non-empty string.");
  return input.trim();
}

function optionalText(input: unknown, path: string): string | undefined {
  if (input === undefined) return undefined;
  return text(input, path);
}

function finiteNumber(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isFinite(input)) invalid(path, "Expected a finite number.");
  return input;
}

function invalid(path: string, message: string): never {
  throw new StructuralMethodologyError(path, message);
}
