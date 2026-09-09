import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("UI refinement contracts", () => {
  it("marks primary navigation with an active, accessible state", async () => {
    const links = await source("app/app-nav-links.tsx");
    const activeLink = await source("app/active-nav-link.tsx");
    const css = await source("app/globals.css");

    expect(links).toContain("<ActiveNavLink");
    expect(activeLink).toContain("usePathname()");
    expect(activeLink).toContain('aria-current={active ? "page" : undefined}');
    expect(css).toContain(".nav-link.active");
  });

  it("normalizes implicit text and date inputs used by operational filters", async () => {
    const css = await source("app/globals.css");
    expect(css).toContain("input:not([type])");
    expect(css).toContain('input[type="date"]');
    expect(css).toMatch(/input\[type="date"\][^{]*\{[^}]*width:\s*100%/s);
  });

  it("does not expose internal workflow or methodology states in the main catalogs", async () => {
    const jobs = await source("app/page.tsx");
    const methodologies = await source("app/methodologies/page.tsx");

    expect(jobs).toContain('DRAFT: "Borrador"');
    expect(jobs).toContain('IN_REVIEW: "En revisión"');
    expect(methodologies).toContain('ACTIVE: "Activa"');
    expect(methodologies).toContain("methodologyStatusLabels[methodology.status]");
  });
});
