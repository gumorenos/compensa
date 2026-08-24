import { describe, expect, it } from "vitest";
import { roleHasPermission } from "../src/auth/access.js";

describe("calibration permissions", () => {
  it("allows only ADMIN to manage calibration runs while all roles retain normal VIEW", () => {
    expect(roleHasPermission("ADMIN", "MANAGE_CALIBRATION")).toBe(true);
    expect(roleHasPermission("EVALUATOR", "MANAGE_CALIBRATION")).toBe(false);
    expect(roleHasPermission("REVIEWER", "MANAGE_CALIBRATION")).toBe(false);
    expect(roleHasPermission("ADMIN", "VIEW")).toBe(true);
    expect(roleHasPermission("EVALUATOR", "VIEW")).toBe(true);
    expect(roleHasPermission("REVIEWER", "VIEW")).toBe(true);
  });
});
