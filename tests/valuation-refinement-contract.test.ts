import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("valuation visual refinement contract", () => {
  it("keeps the existing valuation workflow and actions intact", async () => {
    const page = await source("app/valuations/[valuationId]/page.tsx");
    const layout = await source("app/valuations/[valuationId]/layout.tsx");

    for (const action of [
      "saveDecisionAction",
      "saveDecisionSupportAction",
      "submitForReviewAction",
      "approveValuationAction",
      "returnForChangesAction",
    ]) {
      expect(page).toContain(action);
    }
    for (const step of ["Evaluar", "Fundamentar", "Revisar", "Aprobar"]) {
      expect(layout).toContain(step);
    }
  });

  it("reduces preamble and nested surface weight with scoped CSS", async () => {
    const css = await source("app/valuation-refinement.css");
    const root = await source("app/layout.tsx");

    expect(root).toContain('import "./valuation-refinement.css"');
    expect(css).toMatch(/\.valuation-journey\s*\{[^}]*margin:\s*-2px 0 10px/s);
    expect(css).toMatch(/\.journey-step\s*\{[^}]*border:\s*0/s);
    expect(css).toMatch(/\.support-block\s*\{[^}]*border-top:\s*1px solid var\(--line\)/s);
    expect(css).toContain(".valuation-layout aside .card");
  });

  it("preserves visible focus and usable touch targets on refined controls", async () => {
    const css = await source("app/valuation-refinement.css");
    expect(css).toMatch(/\.text-button\s*\{[^}]*min-height:\s*36px/s);
    expect(css).toContain(".level-option:focus-visible");
    expect(css).toContain(".details-block > summary:focus-visible");
  });
});
