import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { roleHasPermission } from "../src/auth/access.js";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Gold Standard RBAC", () => {
  it("allows only administrators to manage or inspect the expert reference dataset", () => {
    expect(roleHasPermission("ADMIN", "MANAGE_GOLD_STANDARD")).toBe(true);
    expect(roleHasPermission("EVALUATOR", "MANAGE_GOLD_STANDARD")).toBe(false);
    expect(roleHasPermission("REVIEWER", "MANAGE_GOLD_STANDARD")).toBe(false);
  });

  it("does not use general VIEW for Gold Standard list or case details", async () => {
    const runtime = await source("src/web/gold-standard-runtime.ts");
    expect(runtime.match(/getAppContext\("MANAGE_GOLD_STANDARD"\)/g)).toHaveLength(3);
    expect(runtime).not.toContain('getAppContext("VIEW")');
  });

  it("keeps VIEW available for normal product screens without granting Gold Standard access", () => {
    expect(roleHasPermission("ADMIN", "VIEW")).toBe(true);
    expect(roleHasPermission("EVALUATOR", "VIEW")).toBe(true);
    expect(roleHasPermission("REVIEWER", "VIEW")).toBe(true);
  });
});
