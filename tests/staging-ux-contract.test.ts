import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("staging UX regression contract", () => {
  it("defines shared grid and AI governance checkbox layouts used by pages", async () => {
    const css = await source("app/workflow.css");
    expect(css).toContain(".grid-3");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(css).toContain(".checkbox-row");
    expect(css).toContain('input[type="checkbox"]');
  });

  it("presents tenant governance as organization-scoped controls", async () => {
    const page = await source("app/ai-assistance/page.tsx");
    expect(page).toContain("Organización");
    expect(page).toContain("Estos permisos aplican únicamente a");
    expect(page).toContain("No hay un proveedor externo conectado.");
    expect(page).toContain("No conecta un modelo ni almacena API keys.");
  });

  it("shows a plain-language workflow on the operational home", async () => {
    const page = await source("app/overview/page.tsx");
    expect(page).toContain('className="workflow-strip"');
    expect(page).toContain("Preparar puesto");
    expect(page).toContain("Valorar");
    expect(page).toContain("Revisar");
    expect(page).toContain("Aprobar");
    expect(page).toContain('className="card card-pad status-card"');
  });

  it("keeps valuation states and filters in responsive status-card grids", async () => {
    const page = await source("app/valuations/page.tsx");
    expect(page).toContain("Ir directo a una etapa");
    expect(page).toContain('className="card card-pad status-card"');
    expect(page).toContain('className="grid grid-3"');
    expect(page).toContain("Encontrar una valoración");
  });

  it("uses dedicated active valuation navigation instead of form action spacing", async () => {
    const layout = await source("app/valuations/[valuationId]/layout.tsx");
    const tabs = await source("app/valuations/[valuationId]/valuation-tabs.tsx");
    const css = await source("app/valuation-navigation.css");
    expect(layout).toContain('className="valuation-context-nav"');
    expect(layout).toContain("<ValuationTabs valuationId={valuationId} />");
    expect(layout).toContain('className="valuation-journey"');
    expect(layout).not.toContain('nav className="form-actions"');
    expect(tabs).toContain("usePathname");
    expect(tabs).toContain('aria-current={aiActive ? undefined : "page"}');
    expect(tabs).toContain('aria-current={aiActive ? "page" : undefined}');
    expect(css).toContain(".valuation-tabs");
    expect(css).toContain(".valuation-tab.active");
    expect(css).toContain(".valuation-back-link");
  });
});
