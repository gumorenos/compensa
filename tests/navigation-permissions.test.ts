import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { roleHasPermission } from "../src/auth/access.js";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("role-aware application navigation", () => {
  it("removes hard-coded application links from the root layout", async () => {
    const layout = await source("app/layout.tsx");
    expect(layout).toContain("<AppNavLinks />");
    expect(layout).not.toContain('href="/gold-standard"');
    expect(layout).not.toContain('href="/calibration"');
  });

  it("uses the active request membership and hides all app links when access context is unavailable", async () => {
    const navigation = await source("app/app-nav-links.tsx");
    expect(navigation).toContain('requireRequestAccess("VIEW")');
    expect(navigation).toContain("if (error instanceof AccessError) return null");
  });

  it("renders the expert Gold Standard entry only behind MANAGE_GOLD_STANDARD", async () => {
    const navigation = await source("app/app-nav-links.tsx");
    expect(navigation).toContain('roleHasPermission(access.role, "MANAGE_GOLD_STANDARD")');
    expect(navigation).toContain('href="/gold-standard"');
    expect(roleHasPermission("ADMIN", "MANAGE_GOLD_STANDARD")).toBe(true);
    expect(roleHasPermission("EVALUATOR", "MANAGE_GOLD_STANDARD")).toBe(false);
    expect(roleHasPermission("REVIEWER", "MANAGE_GOLD_STANDARD")).toBe(false);
  });

  it("keeps normal member destinations in the authenticated navigation", async () => {
    const navigation = await source("app/app-nav-links.tsx");
    expect(navigation).toContain('href="/"');
    expect(navigation).toContain('href="/methodologies"');
    expect(navigation).toContain('href="/calibration"');
  });
});
