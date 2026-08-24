import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Gold Standard coverage web contract", () => {
  it("keeps the coverage dashboard read-only but restricted to Gold Standard administrators", async () => {
    const runtime = await source("src/web/gold-standard-coverage-runtime.ts");
    expect(runtime).toContain('getAppContext("MANAGE_GOLD_STANDARD")');
    expect(runtime).not.toContain('getAppContext("VIEW")');
  });

  it("does not invent readiness scores or automatic dataset thresholds", async () => {
    const page = await source("app/gold-standard/coverage/page.tsx");
    expect(page).toContain("No aplica un puntaje de calidad");
    expect(page).toContain("No significan por sí solos que el dataset sea inválido");
    expect(page).not.toMatch(/readinessScore|qualityScore|pass\/fail|aprobado automáticamente/i);
  });

  it("links the coverage dashboard from the admin-only Gold Standard home", async () => {
    const page = await source("app/gold-standard/page.tsx");
    expect(page).toContain('href="/gold-standard/coverage"');
    expect(page).toContain("Ver cobertura");
  });

  it("keeps the calibration-to-Gold-Standard link behind calibration management rights", async () => {
    const page = await source("app/calibration/page.tsx");
    expect(page).toContain("{data.canManage && (");
    expect(page).toContain('href="/gold-standard"');
  });
});
