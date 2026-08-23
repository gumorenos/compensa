import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const utf8 = "utf8";

describe("spreadsheet import UI/server contract", () => {
  it("protects spreadsheet actions with the same ADMIN permissions as JSON imports", async () => {
    const gold = await readFile("src/web/gold-standard-spreadsheet-actions.ts", utf8);
    const methodology = await readFile("src/web/methodology-spreadsheet-actions.ts", utf8);
    expect(gold).toContain('getAppContext("MANAGE_GOLD_STANDARD")');
    expect(methodology).toContain('getAppContext("MANAGE_METHODOLOGIES")');
  });

  it("repeats dry-run validation in server actions immediately before writes", async () => {
    const gold = await readFile("src/web/gold-standard-spreadsheet-actions.ts", utf8);
    const methodology = await readFile("src/web/methodology-spreadsheet-actions.ts", utf8);
    expect(gold).toContain("previewService.preview(context.organization.id, document)");
    expect(gold).toContain("if (!preview.canImport)");
    expect(gold).toContain("importHistoricalCases(");
    expect(methodology).toContain("service.preview(context.organization.id, document)");
    expect(methodology).toContain('if (preview.status !== "VALID" || preview.definition === null)');
    expect(methodology).toContain("service.importActive(context.organization.id, document, contentOwner)");
  });

  it("keeps templates permission-aware and upload controls restricted to xlsx/csv", async () => {
    const route = await readFile("app/api/templates/[file]/route.ts", utf8);
    const goldForm = await readFile("src/web/gold-standard-spreadsheet-form.tsx", utf8);
    const methodologyForm = await readFile("src/web/methodology-spreadsheet-form.tsx", utf8);
    expect(route).toContain('permission: "MANAGE_GOLD_STANDARD"');
    expect(route).toContain('permission: "MANAGE_METHODOLOGIES"');
    expect(route).toContain("requireRequestAccess(requested.permission)");
    expect(goldForm).toContain('accept=".xlsx,.csv');
    expect(methodologyForm).toContain('accept=".xlsx,.csv');
  });

  it("invalidates client import readiness after the selected file or methodology owner changes", async () => {
    const goldForm = await readFile("src/web/gold-standard-spreadsheet-form.tsx", utf8);
    const methodologyForm = await readFile("src/web/methodology-spreadsheet-form.tsx", utf8);
    expect(goldForm).toContain("!fileChanged");
    expect(methodologyForm).toContain("!fileChanged");
    expect(methodologyForm).toContain("previewMatchesOwner");
  });
});
