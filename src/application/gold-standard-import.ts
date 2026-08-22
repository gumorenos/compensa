import type { GoldStandardJobSnapshot, GoldStandardPartition } from "../domain/gold-standard.js";
import { PersistenceError, type EvidenceSourceType } from "../persistence/database.js";

export interface GoldStandardHistoricalEvidence {
  sourceType: EvidenceSourceType;
  sourceSection?: string | null | undefined;
  excerpt: string;
}

export interface GoldStandardHistoricalDecision {
  dimensionCode: string;
  selectedLevelCode: string;
  justification?: string | null | undefined;
  evidence?: GoldStandardHistoricalEvidence[] | undefined;
}

export interface GoldStandardImportRow {
  caseCode: string;
  anonymizedLabel: string;
  methodologyVersionId: string;
  job: GoldStandardJobSnapshot;
  description?: string | null | undefined;
  decisions: GoldStandardHistoricalDecision[];
  expectedTotalPoints?: number | undefined;
  expectedGradeCode?: string | undefined;
  partition?: GoldStandardPartition | undefined;
  isAnchor?: boolean | undefined;
  expertUserId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface GoldStandardImportDocument {
  version: 1;
  cases: GoldStandardImportRow[];
}

const PARTITIONS = new Set<GoldStandardPartition>(["UNASSIGNED", "CALIBRATION", "HOLDOUT"]);
const EVIDENCE_TYPES = new Set<EvidenceSourceType>(["JOB_DESCRIPTION", "INTERVIEW", "OTHER"]);

export function parseGoldStandardImport(input: unknown): GoldStandardImportDocument {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.cases)) {
    throw new PersistenceError("GOLD_IMPORT_INVALID_DOCUMENT", "Gold Standard import must be an object with version 1 and a cases array.");
  }
  if (input.cases.length === 0) {
    throw new PersistenceError("GOLD_IMPORT_EMPTY", "Gold Standard import contains no cases.");
  }

  const caseCodes = new Set<string>();
  const cases = input.cases.map((raw, index) => parseRow(raw, index));
  for (const row of cases) {
    if (caseCodes.has(row.caseCode)) {
      throw new PersistenceError("GOLD_IMPORT_DUPLICATE_CASE_CODE", `Duplicate caseCode in import: ${row.caseCode}.`);
    }
    caseCodes.add(row.caseCode);
  }
  return { version: 1, cases };
}

function parseRow(raw: unknown, index: number): GoldStandardImportRow {
  if (!isRecord(raw)) invalid(index, "case must be an object");
  const caseCode = requiredString(raw.caseCode, index, "caseCode");
  const anonymizedLabel = requiredString(raw.anonymizedLabel, index, "anonymizedLabel");
  const methodologyVersionId = requiredString(raw.methodologyVersionId, index, "methodologyVersionId");
  const job = parseJob(raw.job, index);
  const decisions = parseDecisions(raw.decisions, index);

  let partition: GoldStandardPartition | undefined;
  if (raw.partition !== undefined) {
    if (typeof raw.partition !== "string" || !PARTITIONS.has(raw.partition as GoldStandardPartition)) {
      invalid(index, "partition must be UNASSIGNED, CALIBRATION or HOLDOUT");
    }
    partition = raw.partition as GoldStandardPartition;
  }

  let isAnchor: boolean | undefined;
  if (raw.isAnchor !== undefined) {
    if (typeof raw.isAnchor !== "boolean") invalid(index, "isAnchor must be boolean");
    isAnchor = raw.isAnchor as boolean;
  }

  let expectedTotalPoints: number | undefined;
  if (raw.expectedTotalPoints !== undefined) {
    if (typeof raw.expectedTotalPoints !== "number" || !Number.isFinite(raw.expectedTotalPoints)) {
      invalid(index, "expectedTotalPoints must be a finite number");
    }
    expectedTotalPoints = raw.expectedTotalPoints as number;
  }
  const expectedGradeCode = optionalString(raw.expectedGradeCode, index, "expectedGradeCode");
  if ((expectedTotalPoints === undefined) !== (expectedGradeCode === undefined)) {
    invalid(index, "expectedTotalPoints and expectedGradeCode must be supplied together");
  }

  return {
    caseCode,
    anonymizedLabel,
    methodologyVersionId,
    job,
    description: optionalNullableString(raw.description, index, "description"),
    decisions,
    expectedTotalPoints,
    expectedGradeCode,
    partition,
    isAnchor,
    expertUserId: optionalNullableString(raw.expertUserId, index, "expertUserId"),
    notes: optionalNullableString(raw.notes, index, "notes"),
  };
}

function parseJob(value: unknown, index: number): GoldStandardJobSnapshot {
  if (!isRecord(value)) invalid(index, "job must be an object");
  return {
    code: optionalNullableString(value.code, index, "job.code") ?? null,
    name: requiredString(value.name, index, "job.name"),
    department: optionalNullableString(value.department, index, "job.department") ?? null,
    area: optionalNullableString(value.area, index, "job.area") ?? null,
    jobFamily: optionalNullableString(value.jobFamily, index, "job.jobFamily") ?? null,
  };
}

function parseDecisions(value: unknown, index: number): GoldStandardHistoricalDecision[] {
  if (!Array.isArray(value) || value.length === 0) invalid(index, "decisions must be a non-empty array");
  const seen = new Set<string>();
  return value.map((rawDecision, decisionIndex) => {
    if (!isRecord(rawDecision)) invalid(index, `decision ${decisionIndex + 1} must be an object`);
    const dimensionCode = requiredString(rawDecision.dimensionCode, index, `decision ${decisionIndex + 1}.dimensionCode`);
    if (seen.has(dimensionCode)) invalid(index, `duplicate decision for dimension ${dimensionCode}`);
    seen.add(dimensionCode);
    const selectedLevelCode = requiredString(rawDecision.selectedLevelCode, index, `decision ${decisionIndex + 1}.selectedLevelCode`);
    const evidence = parseEvidence(rawDecision.evidence, index, decisionIndex);
    return {
      dimensionCode,
      selectedLevelCode,
      justification: optionalNullableString(rawDecision.justification, index, `decision ${decisionIndex + 1}.justification`),
      evidence,
    };
  });
}

function parseEvidence(value: unknown, caseIndex: number, decisionIndex: number): GoldStandardHistoricalEvidence[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalid(caseIndex, `decision ${decisionIndex + 1}.evidence must be an array`);
  return value.map((rawEvidence, evidenceIndex) => {
    if (!isRecord(rawEvidence)) invalid(caseIndex, `decision ${decisionIndex + 1}.evidence ${evidenceIndex + 1} must be an object`);
    const sourceType = requiredString(rawEvidence.sourceType, caseIndex, `decision ${decisionIndex + 1}.evidence ${evidenceIndex + 1}.sourceType`);
    if (!EVIDENCE_TYPES.has(sourceType as EvidenceSourceType)) {
      invalid(caseIndex, `decision ${decisionIndex + 1}.evidence ${evidenceIndex + 1}.sourceType is invalid`);
    }
    return {
      sourceType: sourceType as EvidenceSourceType,
      sourceSection: optionalNullableString(rawEvidence.sourceSection, caseIndex, `decision ${decisionIndex + 1}.evidence ${evidenceIndex + 1}.sourceSection`),
      excerpt: requiredString(rawEvidence.excerpt, caseIndex, `decision ${decisionIndex + 1}.evidence ${evidenceIndex + 1}.excerpt`),
    };
  });
}

function requiredString(value: unknown, index: number, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) invalid(index, `${field} is required`);
  return (value as string).trim();
}

function optionalString(value: unknown, index: number, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) invalid(index, `${field} must be a non-empty string`);
  return (value as string).trim();
}

function optionalNullableString(value: unknown, index: number, field: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") invalid(index, `${field} must be a string or null`);
  const trimmed = (value as string).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function invalid(index: number, message: string): never {
  throw new PersistenceError("GOLD_IMPORT_INVALID_ROW", `Case ${index + 1}: ${message}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
