import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);

async function read(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), "utf8");
}

describe("Gold Standard historical import UI contract", () => {
  it("keeps the server action protected and revalidates before importing", async () => {
    const source = await read("src/web/gold-standard-import-actions.ts");
    expect(source).toContain('getAppContext("MANAGE_GOLD_STANDARD")');
    expect(source).toContain("previewService.preview(context.organization.id, document)");
    expect(source).toContain("if (!preview.canImport)");
    expect(source).toContain("service.importHistoricalCases(");
  });

  it("invalidates import readiness when the editor no longer matches the preview", async () => {
    const source = await read("src/web/gold-standard-import-form.tsx");
    expect(source).toContain('state.payload === payload.trim()');
    expect(source).toContain("const canImport = previewMatchesPayload && state.preview?.canImport === true");
    expect(source).toContain('name="intent"');
    expect(source).toContain('value="preview"');
    expect(source).toContain('value="import"');
  });

  it("protects the page itself with the Gold Standard management permission", async () => {
    const source = await read("app/gold-standard/import/page.tsx");
    expect(source).toContain('getAppContext("MANAGE_GOLD_STANDARD")');
  });
});
