import { describe, expect, it } from "vitest";
import { roleHasPermission } from "../src/auth/access.js";

describe("Gold Standard RBAC", () => {
  it("allows only administrators to manage the Gold Standard", () => {
    expect(roleHasPermission("ADMIN", "MANAGE_GOLD_STANDARD")).toBe(true);
    expect(roleHasPermission("EVALUATOR", "MANAGE_GOLD_STANDARD")).toBe(false);
    expect(roleHasPermission("REVIEWER", "MANAGE_GOLD_STANDARD")).toBe(false);
  });

  it("keeps Gold Standard readable through the general VIEW permission", () => {
    expect(roleHasPermission("ADMIN", "VIEW")).toBe(true);
    expect(roleHasPermission("EVALUATOR", "VIEW")).toBe(true);
    expect(roleHasPermission("REVIEWER", "VIEW")).toBe(true);
  });
});
