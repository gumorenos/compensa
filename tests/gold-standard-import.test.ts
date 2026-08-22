import { describe, expect, it } from "vitest";
import { parseGoldStandardImport } from "../src/application/gold-standard-import.js";

describe("Gold Standard import parser", () => {
  it("normalizes a valid version 1 document", () => {
    expect(parseGoldStandardImport({
      version: 1,
      cases: [{
        valuationId: " valuation-1 ",
        caseCode: " GS-001 ",
        anonymizedLabel: " Referencia 001 ",
        partition: "CALIBRATION",
        isAnchor: true,
        expertUserId: null,
        notes: " comité validado ",
      }],
    })).toEqual({
      version: 1,
      cases: [{
        valuationId: "valuation-1",
        caseCode: "GS-001",
        anonymizedLabel: "Referencia 001",
        partition: "CALIBRATION",
        isAnchor: true,
        expertUserId: null,
        notes: "comité validado",
      }],
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
        { valuationId: "v1", caseCode: "GS-DUP", anonymizedLabel: "Uno" },
        { valuationId: "v2", caseCode: "GS-DUP", anonymizedLabel: "Dos" },
      ],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_DUPLICATE_CASE_CODE" }));
  });

  it("rejects duplicate source valuation IDs before writes", () => {
    expect(() => parseGoldStandardImport({
      version: 1,
      cases: [
        { valuationId: "v1", caseCode: "GS-1", anonymizedLabel: "Uno" },
        { valuationId: "v1", caseCode: "GS-2", anonymizedLabel: "Dos" },
      ],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_DUPLICATE_VALUATION" }));
  });

  it("rejects invalid partition and non-boolean anchor", () => {
    expect(() => parseGoldStandardImport({
      version: 1,
      cases: [{ valuationId: "v1", caseCode: "GS-1", anonymizedLabel: "Uno", partition: "TRAIN" }],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_INVALID_ROW" }));

    expect(() => parseGoldStandardImport({
      version: 1,
      cases: [{ valuationId: "v1", caseCode: "GS-1", anonymizedLabel: "Uno", isAnchor: "yes" }],
    })).toThrowError(expect.objectContaining({ code: "GOLD_IMPORT_INVALID_ROW" }));
  });
});
