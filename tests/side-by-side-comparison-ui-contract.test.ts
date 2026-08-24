import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Side-by-side comparison web contract", () => {
  it("uses VIEW and has no Gold Standard or calibration permission dependency", async () => {
    const runtime = await source("src/web/side-by-side-runtime.ts");
    expect(runtime).toContain('getAppContext("VIEW")');
    expect(runtime).not.toContain("MANAGE_GOLD_STANDARD");
    expect(runtime).not.toContain("MANAGE_CALIBRATION");
  });

  it("reads only APPROVED valuations and never queries the expert dataset", async () => {
    const service = await source("src/application/side-by-side-comparison.ts");
    expect(service).toContain("v.status = 'APPROVED'");
    expect(service).toContain("v.organization_id = $1");
    expect(service).not.toMatch(/gold_standard_|HOLDOUT|calibration_run/i);
  });

  it("keeps the 2-to-5 and exact methodology-version constraints visible in UI and backend", async () => {
    const service = await source("src/application/side-by-side-comparison.ts");
    const page = await source("app/comparables/compare/page.tsx");
    expect(service).toContain("valuationIds.length < 2 || valuationIds.length > 5");
    expect(service).toContain("METHODOLOGY_VERSION_MISMATCH");
    expect(page).toContain("Comparar 2–5 valoraciones");
    expect(page).toContain("exactamente la misma versión metodológica");
  });

  it("does not turn observed differences into automatic verdicts", async () => {
    const page = await source("app/comparables/compare/page.tsx");
    expect(page).toContain("No convierte una diferencia en error, equivalencia, PASS/FAIL, outlier ni recomendación automática de grado");
    expect(page).not.toMatch(/similarityScore|outlierScore|readinessScore/);
  });

  it("links the manual workspace from comparable discovery", async () => {
    const page = await source("app/comparables/page.tsx");
    expect(page).toContain('href="/comparables/compare"');
    expect(page).toContain("Comparar 2–5 lado a lado");
  });
});
