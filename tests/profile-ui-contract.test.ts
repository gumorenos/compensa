import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("user profile UI contract", () => {
  it("protects the profile with authenticated VIEW access and shows account context", async () => {
    const page = await source("app/profile/page.tsx");
    expect(page).toContain('requireRequestAccess("VIEW")');
    expect(page).toContain("Mi perfil");
    expect(page).toContain("initialName={access.user.name}");
    expect(page).toContain("email={access.user.email}");
    expect(page).toContain("organizationName={access.organization.name}");
    expect(page).toContain("role={access.role}");
  });

  it("uses Better Auth self-service APIs and does not offer an unsafe email mutation", async () => {
    const form = await source("app/profile/profile-forms.tsx");
    expect(form).toContain("authClient.updateUser({ name })");
    expect(form).toContain("authClient.changePassword({");
    expect(form).toContain("revokeOtherSessions: true");
    expect(form).toContain('window.location.assign("/sign-in?passwordChanged=1")');
    expect(form).toContain('value={email} readOnly');
    expect(form).not.toContain("changeEmail(");
    expect(form).not.toMatch(/UPDATE\s+auth_users/i);
    expect(form).not.toMatch(/auth_accounts/i);
  });

  it("shows a narrow confirmation after a successful password rotation", async () => {
    const signIn = await source("app/sign-in/page.tsx");
    expect(signIn).toContain('passwordChanged === "1"');
    expect(signIn).toContain("Contraseña actualizada. Ingresa nuevamente con tu nueva contraseña.");
    expect(signIn).not.toContain("searchParams.passwordChanged");
  });

  it("keeps profile navigation available on desktop and mobile", async () => {
    const nav = await source("app/session-nav.tsx");
    const css = await source("app/auth.css");
    expect(nav).toContain('href="/profile"');
    expect(nav).toContain("session-user-name");
    expect(nav).toContain("session-profile-mobile");
    expect(nav).toContain("session.user.name");
    expect(nav).toContain("authClient.signOut()");
    expect(css).toContain(".session-profile-mobile");
    expect(css).toContain("display: inline;");
    expect(css).not.toMatch(/\.session-user\s*\{[^}]*display:\s*none/s);
  });
});
