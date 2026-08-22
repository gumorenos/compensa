import type { GoldStandardPartition } from "../domain/gold-standard.js";
import { PersistenceError } from "../persistence/database.js";

export interface GoldStandardImportRow {
  valuationId: string;
  caseCode: string;
  anonymizedLabel: string;
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

export function parseGoldStandardImport(input: unknown): GoldStandardImportDocument {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.cases)) {
    throw new PersistenceError("GOLD_IMPORT_INVALID_DOCUMENT", "Gold Standard import must be an object with version 1 and a cases array.");
  }
  if (input.cases.length === 0) {
    throw new PersistenceError("GOLD_IMPORT_EMPTY", "Gold Standard import contains no cases.");
  }

  const caseCodes = new Set<string>();
  const valuationIds = new Set<string>();
  const cases = input.cases.map((raw, index) => parseRow(raw, index));
  for (const row of cases) {
    if (caseCodes.has(row.caseCode)) {
      throw new PersistenceError("GOLD_IMPORT_DUPLICATE_CASE_CODE", `Duplicate caseCode in import: ${row.caseCode}.`);
    }
    if (valuationIds.has(row.valuationId)) {
      throw new PersistenceError("GOLD_IMPORT_DUPLICATE_VALUATION", `Duplicate valuationId in import: ${row.valuationId}.`);
    }
    caseCodes.add(row.caseCode);
    valuationIds.add(row.valuationId);
  }
  return { version: 1, cases };
}

function parseRow(raw: unknown, index: number): GoldStandardImportRow {
  if (!isRecord(raw)) invalid(index, "case must be an object");
  const valuationId = requiredString(raw.valuationId, index, "valuationId");
  const caseCode = requiredString(raw.caseCode, index, "caseCode");
  const anonymizedLabel = requiredString(raw.anonymizedLabel, index, "anonymizedLabel");

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

  return {
    valuationId,
    caseCode,
    anonymizedLabel,
    partition,
    isAnchor,
    expertUserId: optionalNullableString(raw.expertUserId, index, "expertUserId"),
    notes: optionalNullableString(raw.notes, index, "notes"),
  };
}

function requiredString(value: unknown, index: number, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) invalid(index, `${field} is required`);
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
