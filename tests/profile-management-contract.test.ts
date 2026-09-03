import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { canChangeEmailWithoutTransactionalDelivery } from "../src/auth/profile-policy.js";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("profile management contract", () => {
  it("allows no-verification email changes only for currently unverified accounts", () => {
    expect(canChangeEmailWithoutTransactionalDelivery(false)).toBe(true);
    expect(canChangeEmailWithoutTransactionalDelivery(true)).toBe(false);
  });

  it("keeps profile access tied to authentication rather than tenant membership", async () => {
    const page = await source("app/profile/page.tsx");
    expect(page).toContain("auth.api.getSession");
    expect(page).not.toContain("requireRequestAccess");
    expect(page).toContain("/sign-in?callbackURL=/profile");
  });

  it("exposes profile access from the signed-in user navigation", async () => {
    const nav = await source("app/session-nav.tsx");
    expect(nav).toContain('href="/profile"');
    expect(nav).toContain("session.user.name");
  });

  it("uses Better Auth APIs and requires password verification for email changes", async () => {
    const actions = await source("src/web/profile-actions.ts");
    const authConfig = await source("src/auth/server.ts");

    expect(actions).toContain("auth.api.updateUser");
    expect(actions).toContain("auth.api.changePassword");
    expect(actions).toContain("revokeOtherSessions: true");
    expect(actions).toContain("auth.api.verifyPassword");
    expect(actions).toContain("auth.api.changeEmail");
    expect(actions.indexOf("auth.api.verifyPassword")).toBeLessThan(actions.indexOf("auth.api.changeEmail"));
    expect(actions).toContain("canChangeEmailWithoutTransactionalDelivery(session.user.emailVerified)");
    expect(actions).not.toContain("UPDATE auth_users");
    expect(actions).not.toContain("UPDATE auth_accounts");
    expect(authConfig).toContain("changeEmail: {");
    expect(authConfig).toContain("updateEmailWithoutVerification: true");
  });

  it("does not trim passwords before Better Auth verifies them", async () => {
    const actions = await source("src/web/profile-actions.ts");
    expect(actions).toContain('return typeof raw === "string" ? raw : "";');
    expect(actions).toContain('passwordValue(formData, "currentPassword")');
  });

  it("renders explicit profile controls and verified-email limitation", async () => {
    const form = await source("app/profile/profile-forms.tsx");
    expect(form).toContain("Actualizar nombre");
    expect(form).toContain("Cambiar correo");
    expect(form).toContain("Cambiar contraseña");
    expect(form).toContain("emailVerified ?");
    expect(form).toContain("Compensa aún no tiene configurado el envío transaccional necesario");
    expect(form).toContain('autoComplete="current-password"');
    expect(form).toContain('autoComplete="new-password"');
  });
});
