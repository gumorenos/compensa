import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Internal comparables web contract", () => {
  it("is available through VIEW and never requires Gold Standard permissions", async () => {
    const runtime = await source("src/web/comparables-runtime.ts");
    expect(runtime).toContain('getAppContext("VIEW")');
    expect(runtime).not.toContain("MANAGE_GOLD_STANDARD");
    expect(runtime).not.toContain("MANAGE_CALIBRATION");
  });

  it("reads only approved valuations and has no Gold Standard/HOLDOUT data path", async () => {
    const service = await source("src/application/comparables-service.ts");
    expect(service).toContain("v.status = 'APPROVED'");
    expect(service).toContain("v.methodology_version_id");
    expect(service).not.toMatch(/gold_standard_|HOLDOUT/i);
  });

  it("states the deterministic ordering and rejects opaque similarity/outlier verdicts", async () => {
    const page = await source("app/comparables/page.tsx");
    expect(page).toContain("|Δ grado| → |Δ puntos| → suma de saltos de nivel");
    expect(page).toContain("No existe un score de similitud");
    expect(page).toContain("Esta vista no consulta Gold Standard ni HOLDOUT");
    expect(page).not.toMatch(/readinessScore|similarityScore|outlierScore|PASS|FAIL/);
  });

  it("links comparables from the authenticated role-aware navigation", async () => {
    const nav = await source("app/app-nav-links.tsx");
    expect(nav).toContain('href="/comparables"');
    expect(nav).toContain(">Comparar</Link>");
  });
});
