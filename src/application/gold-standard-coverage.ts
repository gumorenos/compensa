import type { Pool } from "pg";
import type { GoldStandardPartition } from "../domain/gold-standard.js";
import { GoldStandardRepository, type GoldStandardCase } from "../persistence/gold-standard.js";

export interface GoldStandardCoverageTotals {
  totalCases: number;
  validatedCases: number;
  draftCases: number;
  calibrationCases: number;
  holdoutCases: number;
  unassignedCases: number;
  anchorCases: number;
}

export interface CoverageBucket {
  code: string;
  label: string;
  count: number;
}

export interface GoldStandardCoverageGap {
  code:
    | "DRAFT_CASES"
    | "UNASSIGNED_CASES"
    | "NO_CALIBRATION_CASES"
    | "NO_HOLDOUT_CASES"
    | "NO_ANCHOR_CASES"
    | "UNCOVERED_GRADES"
    | "MISSING_JOB_FAMILY"
    | "MISSING_DESCRIPTION"
    | "INCOMPLETE_REQUIRED_DECISIONS"
    | "INCOMPLETE_JUSTIFICATIONS"
    | "NO_EVIDENCE";
  label: string;
  count: number;
  methodologyVersionId: string | null;
}

export interface GoldStandardMethodologyCoverage {
  methodologyVersionId: string;
  methodologyCode: string;
  methodologyName: string;
  methodologyVersion: string;
  totalCases: number;
  validatedCases: number;
  partitions: Record<GoldStandardPartition, number>;
  anchorCases: number;
  grades: CoverageBucket[];
  jobFamilies: CoverageBucket[];
  sourceTypes: CoverageBucket[];
  casesWithDescription: number;
  casesWithEvidence: number;
  casesWithCompleteRequiredDecisions: number;
  casesWithCompleteJustifications: number;
  gaps: GoldStandardCoverageGap[];
}

export interface GoldStandardCoverageReport {
  totals: GoldStandardCoverageTotals;
  methodologies: GoldStandardMethodologyCoverage[];
  gaps: GoldStandardCoverageGap[];
}

interface GoldStandardCaseQuality {
  decisionCodes: Set<string>;
  justifiedDecisionCodes: Set<string>;
  evidenceDecisionCodes: Set<string>;
}

export class GoldStandardCoverageService {
  private readonly gold: GoldStandardRepository;

  constructor(private readonly pool: Pool) {
    this.gold = new GoldStandardRepository(pool);
  }

  async getReport(organizationId: string): Promise<GoldStandardCoverageReport> {
    const [cases, decisions, evidence] = await Promise.all([
      this.gold.listCases(organizationId),
      this.pool.query(
        `SELECT case_id, dimension_code, justification
         FROM gold_standard_decisions
         WHERE organization_id = $1`,
        [organizationId],
      ),
      this.pool.query(
        `SELECT DISTINCT d.case_id, d.dimension_code
         FROM gold_standard_evidence e
         JOIN gold_standard_decisions d
           ON d.id = e.decision_id
          AND d.organization_id = e.organization_id
          AND d.case_id = e.case_id
         WHERE e.organization_id = $1`,
        [organizationId],
      ),
    ]);

    const quality = new Map<string, GoldStandardCaseQuality>();
    const ensure = (caseId: string): GoldStandardCaseQuality => {
      const existing = quality.get(caseId);
      if (existing !== undefined) return existing;
      const created: GoldStandardCaseQuality = {
        decisionCodes: new Set(),
        justifiedDecisionCodes: new Set(),
        evidenceDecisionCodes: new Set(),
      };
      quality.set(caseId, created);
      return created;
    };

    for (const row of decisions.rows) {
      const caseId = row.case_id as string;
      const dimensionCode = row.dimension_code as string;
      const item = ensure(caseId);
      item.decisionCodes.add(dimensionCode);
      if (typeof row.justification === "string" && row.justification.trim() !== "") {
        item.justifiedDecisionCodes.add(dimensionCode);
      }
    }
    for (const row of evidence.rows) {
      ensure(row.case_id as string).evidenceDecisionCodes.add(row.dimension_code as string);
    }

    return buildGoldStandardCoverageReport(cases, quality);
  }
}

export function buildGoldStandardCoverageReport(
  cases: readonly GoldStandardCase[],
  quality: ReadonlyMap<string, GoldStandardCaseQuality> = new Map(),
): GoldStandardCoverageReport {
  const validated = cases.filter((item) => item.status === "VALIDATED");
  const totals: GoldStandardCoverageTotals = {
    totalCases: cases.length,
    validatedCases: validated.length,
    draftCases: cases.length - validated.length,
    calibrationCases: validated.filter((item) => item.partition === "CALIBRATION").length,
    holdoutCases: validated.filter((item) => item.partition === "HOLDOUT").length,
    unassignedCases: validated.filter((item) => item.partition === "UNASSIGNED").length,
    anchorCases: validated.filter((item) => item.isAnchor).length,
  };

  const globalGaps: GoldStandardCoverageGap[] = [];
  if (totals.draftCases > 0) {
    globalGaps.push(gap("DRAFT_CASES", `${totals.draftCases} referencia${plural(totals.draftCases)} aún no está${totals.draftCases === 1 ? "" : "n"} validada${plural(totals.draftCases)}.`, totals.draftCases));
  }
  if (totals.unassignedCases > 0) {
    globalGaps.push(gap("UNASSIGNED_CASES", `${totals.unassignedCases} referencia${plural(totals.unassignedCases)} validada${plural(totals.unassignedCases)} sigue${totals.unassignedCases === 1 ? "" : "n"} sin partición.`, totals.unassignedCases));
  }

  const groups = new Map<string, GoldStandardCase[]>();
  for (const item of cases) {
    const current = groups.get(item.methodologyVersionId) ?? [];
    current.push(item);
    groups.set(item.methodologyVersionId, current);
  }

  const methodologies = [...groups.entries()].map(([methodologyVersionId, grouped]) => {
    const sample = grouped[0];
    if (sample === undefined) throw new Error("Coverage grouping invariant failed.");
    const validatedCases = grouped.filter((item) => item.status === "VALIDATED");
    const partitions: Record<GoldStandardPartition, number> = {
      UNASSIGNED: validatedCases.filter((item) => item.partition === "UNASSIGNED").length,
      CALIBRATION: validatedCases.filter((item) => item.partition === "CALIBRATION").length,
      HOLDOUT: validatedCases.filter((item) => item.partition === "HOLDOUT").length,
    };

    const grades = sample.methodologySnapshot.grades.map((grade) => ({
      code: grade.code,
      label: grade.name,
      count: validatedCases.filter((item) => item.expectedGradeCode === grade.code).length,
    }));
    const jobFamilies = buckets(
      validatedCases.map((item) => normalizeLabel(item.jobSnapshot.jobFamily, "Sin familia")),
    );
    const sourceTypes = buckets(validatedCases.map((item) => item.sourceType));

    let casesWithDescription = 0;
    let casesWithEvidence = 0;
    let casesWithCompleteRequiredDecisions = 0;
    let casesWithCompleteJustifications = 0;
    for (const item of validatedCases) {
      if (item.descriptionSnapshot !== null && item.descriptionSnapshot.trim() !== "") {
        casesWithDescription += 1;
      }
      const stats = quality.get(item.id) ?? emptyQuality();
      if (stats.evidenceDecisionCodes.size > 0) casesWithEvidence += 1;
      const requiredCodes = item.methodologySnapshot.factors.flatMap((factor) =>
        factor.dimensions.filter((dimension) => dimension.required).map((dimension) => dimension.code),
      );
      if (requiredCodes.every((code) => stats.decisionCodes.has(code))) {
        casesWithCompleteRequiredDecisions += 1;
      }
      if (requiredCodes.every((code) => stats.justifiedDecisionCodes.has(code))) {
        casesWithCompleteJustifications += 1;
      }
    }

    const methodologyGaps: GoldStandardCoverageGap[] = [];
    if (validatedCases.length > 0 && partitions.CALIBRATION === 0) {
      methodologyGaps.push(gap("NO_CALIBRATION_CASES", "No hay referencias validadas asignadas a CALIBRATION para esta metodología.", 0, methodologyVersionId));
    }
    if (validatedCases.length > 0 && partitions.HOLDOUT === 0) {
      methodologyGaps.push(gap("NO_HOLDOUT_CASES", "No hay referencias validadas asignadas a HOLDOUT para esta metodología.", 0, methodologyVersionId));
    }
    const anchorCases = validatedCases.filter((item) => item.isAnchor).length;
    if (validatedCases.length > 0 && anchorCases === 0) {
      methodologyGaps.push(gap("NO_ANCHOR_CASES", "No hay puestos ancla marcados para esta metodología.", 0, methodologyVersionId));
    }
    const uncoveredGrades = grades.filter((item) => item.count === 0);
    if (uncoveredGrades.length > 0) {
      methodologyGaps.push(gap(
        "UNCOVERED_GRADES",
        `Grados definidos sin casos validados: ${uncoveredGrades.map((item) => item.code).join(", ")}.`,
        uncoveredGrades.length,
        methodologyVersionId,
      ));
    }
    const missingFamilyCount = validatedCases.filter((item) => normalizeOptional(item.jobSnapshot.jobFamily) === null).length;
    if (missingFamilyCount > 0) {
      methodologyGaps.push(gap("MISSING_JOB_FAMILY", `${missingFamilyCount} caso${plural(missingFamilyCount)} sin familia de puesto.`, missingFamilyCount, methodologyVersionId));
    }
    const missingDescription = validatedCases.length - casesWithDescription;
    if (missingDescription > 0) {
      methodologyGaps.push(gap("MISSING_DESCRIPTION", `${missingDescription} caso${plural(missingDescription)} sin descriptivo congelado.`, missingDescription, methodologyVersionId));
    }
    const incompleteDecisions = validatedCases.length - casesWithCompleteRequiredDecisions;
    if (incompleteDecisions > 0) {
      methodologyGaps.push(gap("INCOMPLETE_REQUIRED_DECISIONS", `${incompleteDecisions} caso${plural(incompleteDecisions)} no cubre${incompleteDecisions === 1 ? "" : "n"} todas las dimensiones obligatorias.`, incompleteDecisions, methodologyVersionId));
    }
    const incompleteJustifications = validatedCases.length - casesWithCompleteJustifications;
    if (incompleteJustifications > 0) {
      methodologyGaps.push(gap("INCOMPLETE_JUSTIFICATIONS", `${incompleteJustifications} caso${plural(incompleteJustifications)} tiene${incompleteJustifications === 1 ? "" : "n"} al menos una decisión obligatoria sin justificación.`, incompleteJustifications, methodologyVersionId));
    }
    const withoutEvidence = validatedCases.length - casesWithEvidence;
    if (withoutEvidence > 0) {
      methodologyGaps.push(gap("NO_EVIDENCE", `${withoutEvidence} caso${plural(withoutEvidence)} no tiene${withoutEvidence === 1 ? "" : "n"} evidencia adjunta a ninguna decisión.`, withoutEvidence, methodologyVersionId));
    }

    return {
      methodologyVersionId,
      methodologyCode: sample.methodologySnapshot.code,
      methodologyName: sample.methodologySnapshot.name,
      methodologyVersion: sample.methodologySnapshot.version,
      totalCases: grouped.length,
      validatedCases: validatedCases.length,
      partitions,
      anchorCases,
      grades,
      jobFamilies,
      sourceTypes,
      casesWithDescription,
      casesWithEvidence,
      casesWithCompleteRequiredDecisions,
      casesWithCompleteJustifications,
      gaps: methodologyGaps,
    } satisfies GoldStandardMethodologyCoverage;
  }).sort((left, right) =>
    left.methodologyName.localeCompare(right.methodologyName, "es") ||
    left.methodologyVersion.localeCompare(right.methodologyVersion, "es"),
  );

  return {
    totals,
    methodologies,
    gaps: [...globalGaps, ...methodologies.flatMap((item) => item.gaps)],
  };
}

function emptyQuality(): GoldStandardCaseQuality {
  return {
    decisionCodes: new Set(),
    justifiedDecisionCodes: new Set(),
    evidenceDecisionCodes: new Set(),
  };
}

function buckets(values: readonly string[]): CoverageBucket[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([code, count]) => ({ code, label: code, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "es"));
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeLabel(value: string | null | undefined, fallback: string): string {
  return normalizeOptional(value) ?? fallback;
}

function gap(
  code: GoldStandardCoverageGap["code"],
  label: string,
  count: number,
  methodologyVersionId: string | null = null,
): GoldStandardCoverageGap {
  return { code, label, count, methodologyVersionId };
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
