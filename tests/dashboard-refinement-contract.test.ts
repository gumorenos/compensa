import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("dashboard density refinement contract", () => {
  it("keeps common valuation filters visible and progressively discloses advanced filters", async () => {
    const page = await source("app/valuations/page.tsx");

    expect(page).toContain("const hasAdvancedFilters = Boolean(");
    expect(page).toContain('className="filter-details" open={hasAdvancedFilters}');
    expect(page).toContain("Más filtros");
    for (const field of [
      'name="q"',
      'name="status"',
      'name="area"',
      'name="gradeCode"',
      'name="jobFamily"',
      'name="methodologyVersionId"',
      'name="actorUserId"',
      'name="dateFrom"',
      'name="dateTo"',
    ]) {
      expect(page).toContain(field);
    }
  });

  it("reduces the visual weight of quick status filters and overview metrics", async () => {
    const page = await source("app/valuations/page.tsx");
    const css = await source("app/dashboard-refinement.css");
    const root = await source("app/layout.tsx");

    expect(page).toContain('className="status-summary"');
    expect(root).toContain('import "./dashboard-refinement.css"');
    expect(css).toMatch(/\.status-summary \.status-card\s*\{[^}]*min-height:\s*0/s);
    expect(css).toContain('[aria-label="Resumen operativo"] .status-card');
  });

  it("preserves AI governance guarantees behind progressive disclosure", async () => {
    const page = await source("app/ai-assistance/page.tsx");

    expect(page).toContain('<details className="card ai-limits">');
    expect(page).toContain("Seguridad y límites de esta configuración");
    expect(page).toContain("No conecta un modelo ni almacena API keys.");
    expect(page).toContain("No cambia puntos, grado, metodología ni estado de una valoración.");
    expect(page).toContain("No da acceso al Gold Standard, HOLDOUT o calibración a la IA.");
    expect(page).toContain("No sustituye la aceptación, modificación o rechazo explícito por una persona.");
  });
});
