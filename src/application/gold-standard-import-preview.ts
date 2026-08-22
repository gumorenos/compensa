import type { Pool } from "pg";
import { evaluateValuation } from "../domain/scoring-engine.js";
import type { ValuationSelections } from "../domain/methodology.js";
import { CompensaRepository } from "../persistence/database.js";
import { parseGoldStandardImport } from "./gold-standard-import.js";

export interface GoldStandardImportPreviewIssue {
  code: string;
  message: string;
}

export interface GoldStandardImportPreviewCase {
  caseCode: string;
  anonymizedLabel: string;
  status: "VALID" | "INVALID";
  recalculatedPoints: number | null;
  recalculatedGradeCode: string | null;
  issues: GoldStandardImportPreviewIssue[];
}

export interface GoldStandardImportPreview {
  totalCases: number;
  validCases: number;
  invalidCases: number;
  canImport: boolean;
  cases: GoldStandardImportPreviewCase[];
}

export class GoldStandardImportPreviewService {
  private readonly core: CompensaRepository;

  constructor(private readonly pool: Pool) {
    this.core = new CompensaRepository(pool);
  }

  async preview(organizationId: string, document: unknown): Promise<GoldStandardImportPreview> {
    const parsed = parseGoldStandardImport(document);
    const existingCodes = await this.existingCaseCodes(
      organizationId,
      parsed.cases.map((item) => item.caseCode),
    );

    const cases: GoldStandardImportPreviewCase[] = [];
    for (const row of parsed.cases) {
      const issues: GoldStandardImportPreviewIssue[] = [];
      let recalculatedPoints: number | null = null;
      let recalculatedGradeCode: string | null = null;

      if (existingCodes.has(row.caseCode)) {
        issues.push({
          code: "GOLD_CASE_CODE_EXISTS",
          message: `Case code ${row.caseCode} already exists in this organization.`,
        });
      }

      const methodology = await this.core.getMethodologyVersionForOrganization(
        organizationId,
        row.methodologyVersionId,
      );
      if (methodology === null) {
        issues.push({
          code: "METHODOLOGY_NOT_FOUND",
          message: "Methodology version is not available to this organization.",
        });
      } else {
        const selections: ValuationSelections = Object.fromEntries(
          row.decisions.map((decision) => [decision.dimensionCode, decision.selectedLevelCode]),
        );
        const scoring = evaluateValuation(methodology.definition, selections);
        if (scoring.status !== "SUCCESS" || scoring.points === null || scoring.grade === null) {
          for (const error of scoring.errors) {
            issues.push({ code: error.code, message: error.message });
          }
        } else {
          recalculatedPoints = scoring.points;
          recalculatedGradeCode = scoring.grade.code;
          if (
            row.expectedTotalPoints !== undefined &&
            row.expectedGradeCode !== undefined &&
            (Math.abs(row.expectedTotalPoints - scoring.points) > 1e-9 ||
              row.expectedGradeCode !== scoring.grade.code)
          ) {
            issues.push({
              code: "GOLD_IMPORT_RESULT_MISMATCH",
              message: `Historical result ${row.expectedTotalPoints}/${row.expectedGradeCode} recalculates to ${scoring.points}/${scoring.grade.code}.`,
            });
          }
        }
      }

      cases.push({
        caseCode: row.caseCode,
        anonymizedLabel: row.anonymizedLabel,
        status: issues.length === 0 ? "VALID" : "INVALID",
        recalculatedPoints,
        recalculatedGradeCode,
        issues,
      });
    }

    const validCases = cases.filter((item) => item.status === "VALID").length;
    const invalidCases = cases.length - validCases;
    return {
      totalCases: cases.length,
      validCases,
      invalidCases,
      canImport: invalidCases === 0,
      cases,
    };
  }

  private async existingCaseCodes(
    organizationId: string,
    caseCodes: string[],
  ): Promise<Set<string>> {
    const result = await this.pool.query(
      `SELECT case_code
       FROM gold_standard_cases
       WHERE organization_id = $1
         AND case_code = ANY($2::text[])`,
      [organizationId, caseCodes],
    );
    return new Set(result.rows.map((row) => row.case_code as string));
  }
}
