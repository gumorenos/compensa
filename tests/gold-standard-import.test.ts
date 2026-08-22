import { describe, expect, it } from "vitest";
import { parseGoldStandardImport } from "../src/application/gold-standard-import.js";

function validCase(overrides: Record<string, unknown> = {}) {
  return {
    caseCode: "GS-001",
    anonymizedLabel: "Referencia 001",
    methodologyVersionId: "methodology-1",
    job: {
      code: "FIN-001",
      name: "Jefatura financiera",
      department: "Finanzas",
      area: "Planeamiento",
      jobFamily: "Finanzas",
    },
    description: "Responsable del planeamiento financiero.",
    decisions: [
      {
        dimensionCode: "AUTONOMY",
        selectedLevelCode: "A2",
        justification: "Decide dentro de políticas definidas.",
        evidence: [
          {
            sourceType: "JOB_DESCRIPTION",
            sourceSection: "Responsabilidades",
            excerpt: "Puede aprobar ajustes operativos dentro de políticas definidas.",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("Gold Standard import parser", () => {
  it("normalizes a valid version 1 historical document", () => {
    const parsed = parseGoldStandardImport({
      version: 1,
      cases: [validCase({
        caseCode: " GS-001 ",
        anonymizedLabel: " Referencia 001 ",
        partition: "CALIBRATION",
        isAnchor: true,
        expectedTotalPoints: 231,
        expectedGradeCode: " G3 ",
        expertUserId: null,
        notes: " comité validado ",
      })],
    });

    expect(parsed.version).toBe(1);
    expect(parsed.cases[0]).toMatchObject({
      caseCode: "GS-001",
      anonymizedLabel: "Referencia 001",
      methodologyVersionId: "methodology-1",
      partition: "CALIBRATION",
      isAnchor: true,
      expectedTotalPoints: 231,
      expectedGradeCode: "G3",
      expertUserId: null,
      notes: "comité validado",
    });
    expect(parsed.cases[0]!.decisions[0]!.evidence?.[0]).toMatchObject({
      sourceType: "JOB_DESCRIPTION",
      sourceSection: "Responsabilidades",
    });
  });

  it("rejects unsupported documents and empty batches", () => {
    expect(() => parseGoldStandardImport({ version: 2, cases: [] }))
      .toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_INVALID_DOCUMENT" }));
    expect(() => parseGoldStandardImport({ version: 1, cases: [] }))
      .toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_EMPTY" }));
  });

  it("rejects duplicate case codes before writes", () => {
    expect(() => parseGoldStandardImport({
      version: 1,
      cases: [
        validCase({ caseCode: "GS-DUP" }),
        validCase({ caseCode: "GS-DUP", anonymizedLabel: "Otra referencia" }),
      ],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_DUPLICATE_CASE_CODE" }));
  });

  it("rejects duplicate dimensions inside one historical case", () => {
    expect(() => parseGoldStandardImport({
      version: 1,
      cases: [validCase({
        decisions: [
          { dimensionCode: "AUTONOMY", selectedLevelCode: "A1" },
          { dimensionCode: "AUTONOMY", selectedLevelCode: "A2" },
        ],
      })],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_INVALID_ROW" }));
  });

  it("requires expected points and grade together", () => {
    expect(() => parseGoldStandardImport({
      version: 1,
      cases: [validCase({ expectedTotalPoints: 231 })],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_INVALID_ROW" }));
  });

  it("rejects invalid partition, evidence type and non-boolean anchor", () => {
    expect(() => parseGoldStandardImport({
      version: 1,
      cases: [validCase({ partition: "TRAIN" })],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_INVALID_ROW" }));

    expect(() => parseGoldStandardImport({
      version: 1,
      cases: [validCase({ isAnchor: "yes" })],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_INVALID_ROW" }));

    expect(() => parseGoldStandardImport({
      version: 1,
      cases: [validCase({
        decisions: [{
          dimensionCode: "AUTONOMY",
          selectedLevelCode: "A2",
          evidence: [{ sourceType: "WEB", excerpt: "Texto" }],
        }],
      })],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_INVALID_ROW" }));
  });
});
