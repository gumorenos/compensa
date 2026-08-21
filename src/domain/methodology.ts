export interface MethodologyDefinition {
  code: string;
  name: string;
  version: string;
  factors: FactorDefinition[];
  scoring: ScoringDefinition;
  grades: GradeDefinition[];
}

export interface FactorDefinition {
  code: string;
  name: string;
  description?: string;
  dimensions: DimensionDefinition[];
}

export interface DimensionDefinition {
  code: string;
  name: string;
  description?: string;
  required: boolean;
  levels: LevelDefinition[];
}

export interface LevelDefinition {
  code: string;
  label: string;
  description?: string;
}

export interface GradeDefinition {
  code: string;
  name: string;
  minPoints: number;
  maxPoints: number;
}

export interface ScoringDefinition {
  steps: ScoringStep[];
  totalStep: string;
}

export type ScoringStep =
  | LookupStep
  | SumStep
  | MultiplyStep
  | DivideStep
  | RoundStep;

interface BaseStep {
  code: string;
  label?: string;
}

export interface LookupStep extends BaseStep {
  type: "lookup";
  inputs: LookupInputReference[];
  table: Record<string, number>;
}

export interface SumStep extends BaseStep {
  type: "sum";
  operands: NumericReference[];
}

export interface MultiplyStep extends BaseStep {
  type: "multiply";
  operands: NumericReference[];
}

export interface DivideStep extends BaseStep {
  type: "divide";
  numerator: NumericReference;
  denominator: NumericReference;
}

export interface RoundStep extends BaseStep {
  type: "round";
  value: NumericReference;
  precision: number;
}

export type LookupInputReference = SelectionReference | StepReference;
export type NumericReference = ConstantReference | StepReference;

export interface SelectionReference {
  kind: "selection";
  dimension: string;
}

export interface StepReference {
  kind: "step";
  step: string;
}

export interface ConstantReference {
  kind: "constant";
  value: number;
}

export type ValuationSelections = Record<string, string>;

export const LOOKUP_KEY_SEPARATOR = "::";

export function lookupKey(...parts: Array<string | number>): string {
  return parts.map(String).join(LOOKUP_KEY_SEPARATOR);
}
