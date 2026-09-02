import { describe, expect, it } from "vitest";
import { buildSpreadsheetTemplate } from "../src/application/spreadsheet-templates.js";

describe("spreadsheet templates", () => {
  it("builds a methodology CSV with the expected download metadata", async () => {
    const template = await buildSpreadsheetTemplate("methodology", "csv");

    expect(template.fileName).toBe("compensa-metodologia.csv");
    expect(template.contentType).toBe("text/csv; charset=utf-8");
    expect(typeof template.body).toBe("string");
    expect(template.body).toContain("tipo_registro");
    expect(template.body).toContain("paso_total");
  });

  it("builds a real methodology XLSX archive", async () => {
    const template = await buildSpreadsheetTemplate("methodology", "xlsx");

    expect(template.fileName).toBe("compensa-metodologia.xlsx");
    expect(template.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(template.body).toBeInstanceOf(Uint8Array);

    const bytes = template.body as Uint8Array;
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("builds a real Gold Standard XLSX archive too", async () => {
    const template = await buildSpreadsheetTemplate("gold-standard", "xlsx");
    const bytes = template.body as Uint8Array;

    expect(template.fileName).toBe("compensa-gold-standard.xlsx");
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
