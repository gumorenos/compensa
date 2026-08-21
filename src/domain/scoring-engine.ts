import { issue, type EngineIssue, type EngineStatus } from "./errors.js";
import {
  type DimensionDefinition,
  type GradeDefinition,
  type LookupInputReference,
  type MethodologyDefinition,
  type NumericReference,
  type ScoringStep,
  type ValuationSelections,
  lookupKey,
} from "./methodology.js";

export interface TraceInput {
  source: string;
  value: string | number;
}

export interface CalculationTraceStep {
  code: string;
  label?: string;
  type: ScoringStep["type"];
  inputs: TraceInput[];
  output: number;
}

export interface ScoringResult {
  status: EngineStatus;
  points: number | null;
  grade: GradeDefinition | null;
  trace: CalculationTraceStep[];
  errors: EngineIssue[];
  warnings: EngineIssue[];
}

interface StepEvaluation {
  value: number;
  inputs: TraceInput[];
}

export function evaluateValuation(
  methodology: MethodologyDefinition,
  selections: ValuationSelections,
): ScoringResult {
  const methodologyErrors = validateMethodology(methodology);
  if (methodologyErrors.length > 0) {
    return failure(methodologyErrors);
  }

  const selectionErrors = validateSelections(methodology, selections);
  if (selectionErrors.length > 0) {
    return failure(selectionErrors);
  }

  const stepResults = new Map<string, number>();
  const trace: CalculationTraceStep[] = [];

  for (const step of methodology.scoring.steps) {
    const evaluated = evaluateStep(step, selections, stepResults);
    if (isIssue(evaluated)) {
      return failure([evaluated], trace);
    }

    if (!Number.isFinite(evaluated.value)) {
      return failure(
        [issue("NON_FINITE_RESULT", `Step ${step.code} produced a non-finite result.`, `scoring.steps.${step.code}`)],
        trace,
      );
    }

    stepResults.set(step.code, evaluated.value);
    const baseTrace = {
      code: step.code,
      type: step.type,
      inputs: evaluated.inputs,
      output: evaluated.value,
    };
    trace.push(step.label === undefined ? baseTrace : { ...baseTrace, label: step.label });
  }

  const points = stepResults.get(methodology.scoring.totalStep);
  if (points === undefined) {
    return failure(
      [issue("TOTAL_STEP_MISSING", `Total step ${methodology.scoring.totalStep} did not produce a result.`, "scoring.totalStep")],
      trace,
    );
  }

  const grade = methodology.grades.find(
    (candidate) => points >= candidate.minPoints && points <= candidate.maxPoints,
  );

  if (grade === undefined) {
    return failure(
      [issue("NO_GRADE_MATCH", `No grade range contains ${points} points.`, "grades")],
      trace,
      points,
    );
  }

  return {
    status: "SUCCESS",
    points,
    grade,
    trace,
    errors: [],
    warnings: [],
  };
}

export function validateMethodology(methodology: MethodologyDefinition): EngineIssue[] {
  const errors: EngineIssue[] = [];
  const factorCodes = new Set<string>();
  const dimensions = new Map<string, DimensionDefinition>();

  for (const factor of methodology.factors) {
    if (factorCodes.has(factor.code)) {
      errors.push(issue("DUPLICATE_FACTOR_CODE", `Factor code ${factor.code} is duplicated.`, `factors.${factor.code}`));
    }
    factorCodes.add(factor.code);

    if (factor.dimensions.length === 0) {
      errors.push(issue("FACTOR_WITHOUT_DIMENSIONS", `Factor ${factor.code} has no dimensions.`, `factors.${factor.code}`));
    }

    for (const dimension of factor.dimensions) {
      if (dimensions.has(dimension.code)) {
        errors.push(
          issue("DUPLICATE_DIMENSION_CODE", `Dimension code ${dimension.code} is duplicated.`, `dimensions.${dimension.code}`),
        );
      } else {
        dimensions.set(dimension.code, dimension);
      }

      if (dimension.levels.length === 0) {
        errors.push(
          issue("DIMENSION_WITHOUT_LEVELS", `Dimension ${dimension.code} has no levels.`, `dimensions.${dimension.code}`),
        );
      }

      const levelCodes = new Set<string>();
      for (const level of dimension.levels) {
        if (levelCodes.has(level.code)) {
          errors.push(
            issue(
              "DUPLICATE_LEVEL_CODE",
              `Level code ${level.code} is duplicated inside dimension ${dimension.code}.`,
              `dimensions.${dimension.code}.levels.${level.code}`,
            ),
          );
        }
        levelCodes.add(level.code);
      }
    }
  }

  validateGrades(methodology.grades, errors);
  validateScoring(methodology, dimensions, errors);
  return errors;
}

function validateGrades(grades: GradeDefinition[], errors: EngineIssue[]): void {
  const gradeCodes = new Set<string>();

  for (const grade of grades) {
    if (gradeCodes.has(grade.code)) {
      errors.push(issue("DUPLICATE_GRADE_CODE", `Grade code ${grade.code} is duplicated.`, `grades.${grade.code}`));
    }
    gradeCodes.add(grade.code);

    if (!Number.isFinite(grade.minPoints) || !Number.isFinite(grade.maxPoints)) {
      errors.push(issue("INVALID_GRADE_RANGE", `Grade ${grade.code} must use finite point limits.`, `grades.${grade.code}`));
    } else if (grade.minPoints > grade.maxPoints) {
      errors.push(issue("INVALID_GRADE_RANGE", `Grade ${grade.code} has minPoints greater than maxPoints.`, `grades.${grade.code}`));
    }
  }

  const ordered = [...grades].sort((left, right) => left.minPoints - right.minPoints);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous !== undefined && current !== undefined && current.minPoints <= previous.maxPoints) {
      errors.push(
        issue(
          "OVERLAPPING_GRADE_RANGES",
          `Grade ${current.code} overlaps grade ${previous.code}.`,
          "grades",
        ),
      );
    }
  }
}

function validateScoring(
  methodology: MethodologyDefinition,
  dimensions: Map<string, DimensionDefinition>,
  errors: EngineIssue[],
): void {
  const stepCodes = new Set<string>();
  const availableSteps = new Set<string>();

  for (const step of methodology.scoring.steps) {
    if (stepCodes.has(step.code)) {
      errors.push(issue("DUPLICATE_STEP_CODE", `Scoring step code ${step.code} is duplicated.`, `scoring.steps.${step.code}`));
    }
    stepCodes.add(step.code);

    switch (step.type) {
      case "lookup":
        if (step.inputs.length === 0) {
          errors.push(issue("LOOKUP_WITHOUT_INPUTS", `Lookup step ${step.code} has no inputs.`, `scoring.steps.${step.code}`));
        }
        for (const reference of step.inputs) {
          validateLookupReference(reference, dimensions, availableSteps, step.code, errors);
        }
        for (const [key, value] of Object.entries(step.table)) {
          if (!Number.isFinite(value)) {
            errors.push(
              issue("INVALID_LOOKUP_VALUE", `Lookup ${step.code} key ${key} has a non-finite value.`, `scoring.steps.${step.code}`),
            );
          }
        }
        break;
      case "sum":
      case "multiply":
        if (step.operands.length === 0) {
          errors.push(issue("ARITHMETIC_WITHOUT_OPERANDS", `Step ${step.code} has no operands.`, `scoring.steps.${step.code}`));
        }
        for (const reference of step.operands) {
          validateNumericReference(reference, availableSteps, step.code, errors);
        }
        break;
      case "divide":
        validateNumericReference(step.numerator, availableSteps, step.code, errors);
        validateNumericReference(step.denominator, availableSteps, step.code, errors);
        break;
      case "round":
        validateNumericReference(step.value, availableSteps, step.code, errors);
        if (!Number.isInteger(step.precision) || step.precision < 0 || step.precision > 8) {
          errors.push(
            issue("INVALID_ROUND_PRECISION", `Step ${step.code} precision must be an integer from 0 to 8.`, `scoring.steps.${step.code}`),
          );
        }
        break;
    }

    availableSteps.add(step.code);
  }

  if (!stepCodes.has(methodology.scoring.totalStep)) {
    errors.push(
      issue(
        "UNKNOWN_TOTAL_STEP",
        `Total step ${methodology.scoring.totalStep} is not defined.`,
        "scoring.totalStep",
      ),
    );
  }
}

function validateLookupReference(
  reference: LookupInputReference,
  dimensions: Map<string, DimensionDefinition>,
  availableSteps: Set<string>,
  currentStep: string,
  errors: EngineIssue[],
): void {
  if (reference.kind === "selection") {
    if (!dimensions.has(reference.dimension)) {
      errors.push(
        issue(
          "UNKNOWN_DIMENSION_REFERENCE",
          `Step ${currentStep} references unknown dimension ${reference.dimension}.`,
          `scoring.steps.${currentStep}`,
        ),
      );
    }
    return;
  }

  validatePriorStepReference(reference.step, availableSteps, currentStep, errors);
}

function validateNumericReference(
  reference: NumericReference,
  availableSteps: Set<string>,
  currentStep: string,
  errors: EngineIssue[],
): void {
  if (reference.kind === "constant") {
    if (!Number.isFinite(reference.value)) {
      errors.push(
        issue("INVALID_CONSTANT", `Step ${currentStep} contains a non-finite constant.`, `scoring.steps.${currentStep}`),
      );
    }
    return;
  }

  validatePriorStepReference(reference.step, availableSteps, currentStep, errors);
}

function validatePriorStepReference(
  referencedStep: string,
  availableSteps: Set<string>,
  currentStep: string,
  errors: EngineIssue[],
): void {
  if (!availableSteps.has(referencedStep)) {
    errors.push(
      issue(
        "INVALID_STEP_REFERENCE",
        `Step ${currentStep} references ${referencedStep}, which must be defined earlier.`,
        `scoring.steps.${currentStep}`,
      ),
    );
  }
}

function validateSelections(
  methodology: MethodologyDefinition,
  selections: ValuationSelections,
): EngineIssue[] {
  const errors: EngineIssue[] = [];
  const dimensions = collectDimensions(methodology);

  for (const selectedDimension of Object.keys(selections)) {
    if (!dimensions.has(selectedDimension)) {
      errors.push(
        issue(
          "UNKNOWN_DIMENSION_SELECTION",
          `Selection provided for unknown dimension ${selectedDimension}.`,
          `selections.${selectedDimension}`,
        ),
      );
    }
  }

  for (const [dimensionCode, dimension] of dimensions) {
    const selectedLevel = selections[dimensionCode];
    if (selectedLevel === undefined) {
      if (dimension.required) {
        errors.push(
          issue("MISSING_REQUIRED_SELECTION", `Dimension ${dimensionCode} requires a selection.`, `selections.${dimensionCode}`),
        );
      }
      continue;
    }

    if (!dimension.levels.some((level) => level.code === selectedLevel)) {
      errors.push(
        issue(
          "INVALID_LEVEL_SELECTION",
          `Level ${selectedLevel} does not exist in dimension ${dimensionCode}.`,
          `selections.${dimensionCode}`,
        ),
      );
    }
  }

  return errors;
}

function collectDimensions(methodology: MethodologyDefinition): Map<string, DimensionDefinition> {
  const dimensions = new Map<string, DimensionDefinition>();
  for (const factor of methodology.factors) {
    for (const dimension of factor.dimensions) {
      dimensions.set(dimension.code, dimension);
    }
  }
  return dimensions;
}

function evaluateStep(
  step: ScoringStep,
  selections: ValuationSelections,
  stepResults: Map<string, number>,
): StepEvaluation | EngineIssue {
  switch (step.type) {
    case "lookup": {
      const inputs: TraceInput[] = [];
      const keyParts: Array<string | number> = [];

      for (const reference of step.inputs) {
        const resolved = resolveLookupInput(reference, selections, stepResults);
        if (isIssue(resolved)) {
          return resolved;
        }
        inputs.push(resolved.trace);
        keyParts.push(resolved.value);
      }

      const key = lookupKey(...keyParts);
      if (!Object.hasOwn(step.table, key)) {
        return issue(
          "LOOKUP_KEY_NOT_FOUND",
          `Lookup step ${step.code} has no configured value for key ${key}.`,
          `scoring.steps.${step.code}.table`,
        );
      }

      const value = step.table[key];
      if (value === undefined) {
        return issue(
          "LOOKUP_KEY_NOT_FOUND",
          `Lookup step ${step.code} has no configured value for key ${key}.`,
          `scoring.steps.${step.code}.table`,
        );
      }
      return { value, inputs };
    }
    case "sum":
      return evaluateOperands(step.operands, stepResults, (values) => values.reduce((total, value) => total + value, 0));
    case "multiply":
      return evaluateOperands(step.operands, stepResults, (values) => values.reduce((total, value) => total * value, 1));
    case "divide": {
      const numerator = resolveNumeric(step.numerator, stepResults);
      if (isIssue(numerator)) return numerator;
      const denominator = resolveNumeric(step.denominator, stepResults);
      if (isIssue(denominator)) return denominator;
      if (denominator.value === 0) {
        return issue("DIVISION_BY_ZERO", `Step ${step.code} attempted to divide by zero.`, `scoring.steps.${step.code}`);
      }
      return {
        value: numerator.value / denominator.value,
        inputs: [numerator.trace, denominator.trace],
      };
    }
    case "round": {
      const resolved = resolveNumeric(step.value, stepResults);
      if (isIssue(resolved)) return resolved;
      const multiplier = 10 ** step.precision;
      return {
        value: Math.round((resolved.value + Number.EPSILON) * multiplier) / multiplier,
        inputs: [resolved.trace],
      };
    }
  }
}

function evaluateOperands(
  operands: NumericReference[],
  stepResults: Map<string, number>,
  operation: (values: number[]) => number,
): StepEvaluation | EngineIssue {
  const values: number[] = [];
  const inputs: TraceInput[] = [];

  for (const operand of operands) {
    const resolved = resolveNumeric(operand, stepResults);
    if (isIssue(resolved)) return resolved;
    values.push(resolved.value);
    inputs.push(resolved.trace);
  }

  return { value: operation(values), inputs };
}

function resolveLookupInput(
  reference: LookupInputReference,
  selections: ValuationSelections,
  stepResults: Map<string, number>,
): { value: string | number; trace: TraceInput } | EngineIssue {
  if (reference.kind === "selection") {
    const value = selections[reference.dimension];
    if (value === undefined) {
      return issue("MISSING_SELECTION", `No selection exists for dimension ${reference.dimension}.`);
    }
    return {
      value,
      trace: { source: `selection:${reference.dimension}`, value },
    };
  }

  const value = stepResults.get(reference.step);
  if (value === undefined) {
    return issue("MISSING_STEP_RESULT", `Step result ${reference.step} is not available.`);
  }
  return {
    value,
    trace: { source: `step:${reference.step}`, value },
  };
}

function resolveNumeric(
  reference: NumericReference,
  stepResults: Map<string, number>,
): { value: number; trace: TraceInput } | EngineIssue {
  if (reference.kind === "constant") {
    return {
      value: reference.value,
      trace: { source: "constant", value: reference.value },
    };
  }

  const value = stepResults.get(reference.step);
  if (value === undefined) {
    return issue("MISSING_STEP_RESULT", `Step result ${reference.step} is not available.`);
  }
  return {
    value,
    trace: { source: `step:${reference.step}`, value },
  };
}

function isIssue(value: unknown): value is EngineIssue {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

function failure(
  errors: EngineIssue[],
  trace: CalculationTraceStep[] = [],
  points: number | null = null,
): ScoringResult {
  return {
    status: "ERROR",
    points,
    grade: null,
    trace,
    errors,
    warnings: [],
  };
}
