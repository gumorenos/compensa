import { describe, expect, it } from "vitest";
import {
  buildGoldStandardCoverageReport,
  type GoldStandardCaseQuality,
} from "../src/application/gold-standard-coverage.js";
import { demoMethodology } from "../src/fixtures/demo-methodology.js";
import type { GoldStandardCase } from "../src/persistence/gold-standard.js";

const requiredCodes = demoMethodology.factors.flatMap((factor) =>
  factor.dimensions.filter((dimension) => dimension.required).map((dimension) => dimension.code),
);

function goldCase(
  id: string,
  overrides: Partial<GoldStandardCase> = {},
): GoldStandardCase {
  const now = new Date("2026-08-23T12:00:00Z");
  return {
    id,
    organizationId: "org-1",
    caseCode: `GS-${id}`,
    anonymizedLabel: `Caso ${id}`,
    sourceType: "IMPORT",
    sourceValuationId: null,
    methodologyVersionId: "method-1",
    jobDescriptionVersionId: null,
    status: "VALIDATED",
    partition: "UNASSIGNED",
    isAnchor: false,
    jobSnapshot: {
      code: `JOB-${id}`,
      name: `Puesto ${id}`,
      department: "Operaciones",
      area: "Planeamiento",
      jobFamily: "Operaciones",
    },
    methodologySnapshot: demoMethodology,
    descriptionSnapshot: "Descriptivo congelado",
    expectedTotalPoints: 231,
    expectedGradeCode: "G3",
    expertUserId: null,
    createdByUserId: null,
    notes: null,
    validatedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function completeQuality(withEvidence = true): GoldStandardCaseQuality {
  return {
    decisionCodes: new Set(requiredCodes),
    justifiedDecisionCodes: new Set(requiredCodes),
    evidenceDecisionCodes: new Set(withEvidence ? [requiredCodes[0]!] : []),
  };
}

describe("Gold Standard coverage report", () => {
  it("describes partitions, grades, anchors, families and evidence without a quality score", () => {
    const cases = [
      goldCase("1", { partition: "CALIBRATION", isAnchor: true }),
      goldCase("2", {
        partition: "HOLDOUT",
        jobSnapshot: {
          code: "JOB-2",
          name: "Puesto 2",
          department: "Finanzas",
          area: null,
          jobFamily: "Finanzas",
        },
      }),
      goldCase("3", {
        partition: "UNASSIGNED",
        descriptionSnapshot: null,
        jobSnapshot: {
          code: "JOB-3",
          name: "Puesto 3",
          department: null,
          area: null,
          jobFamily: null,
        },
      }),
    ];
    const quality = new Map<string, GoldStandardCaseQuality>([
      ["1", completeQuality(true)],
      ["2", completeQuality(false)],
      ["3", {
        decisionCodes: new Set(requiredCodes.slice(0, -1)),
        justifiedDecisionCodes: new Set(requiredCodes.slice(0, -2)),
        evidenceDecisionCodes: new Set(),
      }],
    ]);

    const report = buildGoldStandardCoverageReport(cases, quality);
    expect(report.totals).toMatchObject({
      totalCases: 3,
      validatedCases: 3,
      draftCases: 0,
      archivedCases: 0,
      calibrationCases: 1,
      holdoutCases: 1,
      unassignedCases: 1,
      anchorCases: 1,
    });

    const methodology = report.methodologies[0]!;
    expect(methodology.grades.find((grade) => grade.code === "G3")?.count).toBe(3);
    expect(methodology.grades.filter((grade) => grade.count === 0).map((grade) => grade.code)).toEqual([
      "G1",
      "G2",
      "G4",
      "G5",
    ]);
    expect(methodology.jobFamilies).toEqual([
      { code: "Finanzas", label: "Finanzas", count: 1 },
      { code: "Operaciones", label: "Operaciones", count: 1 },
      { code: "Sin familia", label: "Sin familia", count: 1 },
    ]);
    expect(methodology.casesWithDescription).toBe(2);
    expect(methodology.casesWithEvidence).toBe(1);
    expect(methodology.casesWithCompleteRequiredDecisions).toBe(2);
    expect(methodology.casesWithCompleteJustifications).toBe(2);
    expect(methodology.gaps.map((item) => item.code)).toEqual(expect.arrayContaining([
      "UNCOVERED_GRADES",
      "MISSING_JOB_FAMILY",
      "MISSING_DESCRIPTION",
      "INCOMPLETE_REQUIRED_DECISIONS",
      "INCOMPLETE_JUSTIFICATIONS",
      "NO_EVIDENCE",
    ]));
    expect(JSON.stringify(report)).not.toMatch(/qualityScore|readinessScore|pass|fail/i);
  });

  it("keeps draft and archived references distinct and excludes both from calibration coverage", () => {
    const report = buildGoldStandardCoverageReport([
      goldCase("validated", { partition: "CALIBRATION" }),
      goldCase("draft", { status: "DRAFT", partition: "HOLDOUT", expectedTotalPoints: null, expectedGradeCode: null }),
      goldCase("archived", { status: "ARCHIVED", partition: "HOLDOUT" }),
    ], new Map([["validated", completeQuality()]]));

    expect(report.totals.validatedCases).toBe(1);
    expect(report.totals.draftCases).toBe(1);
    expect(report.totals.archivedCases).toBe(1);
    expect(report.totals.holdoutCases).toBe(0);
    expect(report.gaps.some((item) => item.code === "DRAFT_CASES")).toBe(true);
  });

  it("reports one objective no-validated signal instead of expanding every grade into a gap", () => {
    const report = buildGoldStandardCoverageReport([
      goldCase("draft-only", {
        status: "DRAFT",
        expectedTotalPoints: null,
        expectedGradeCode: null,
      }),
    ]);

    const methodology = report.methodologies[0]!;
    expect(methodology.validatedCases).toBe(0);
    expect(methodology.gaps).toHaveLength(1);
    expect(methodology.gaps[0]?.code).toBe("NO_VALIDATED_CASES");
  });

  it("returns an empty descriptive report for an empty dataset", () => {
    const report = buildGoldStandardCoverageReport([]);
    expect(report.totals.totalCases).toBe(0);
    expect(report.methodologies).toEqual([]);
    expect(report.gaps).toEqual([]);
  });
});
