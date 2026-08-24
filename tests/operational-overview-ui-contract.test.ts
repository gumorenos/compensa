import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("operational overview web contract", () => {
  it("uses general VIEW access", async () => {
    const runtime = await source("src/web/operational-overview-runtime.ts");
    expect(runtime).toContain('getAppContext("VIEW")');
  });

  it("adds Inicio without replacing the existing Puestos root route", async () => {
    const navigation = await source("app/app-nav-links.tsx");
    expect(navigation).toContain('href="/overview">Inicio</Link>');
    expect(navigation).toContain('href="/">Puestos</Link>');
  });

  it("links operational metrics to the existing work queue instead of creating hidden actions", async () => {
    const page = await source("app/overview/page.tsx");
    expect(page).toContain('/valuations?status=DRAFT');
    expect(page).toContain('/valuations?status=IN_REVIEW');
    expect(page).toContain('/valuations?status=RETURNED');
    expect(page).toContain('/valuations?status=APPROVED');
    expect(page).toContain("Últimas 8 versiones");
    expect(page).toContain("No es un historial de auditoría");
  });

  it("keeps Gold Standard, HOLDOUT and calibration data out of the general overview", async () => {
    const service = await source("src/application/operational-overview-service.ts");
    const runtime = await source("src/web/operational-overview-runtime.ts");
    const page = await source("app/overview/page.tsx");
    for (const content of [service, runtime, page]) {
      expect(content).not.toMatch(/gold_standard_|HOLDOUT|calibration_runs|calibration_run_cases/i);
    }
    expect(page).not.toMatch(/readinessScore|PASS|FAIL|madurez automática/i);
  });
});
