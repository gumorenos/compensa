import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCompensaAuth } from "../../src/auth/server.js";
import { createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for profile auth integration tests.");
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error("BETTER_AUTH_SECRET with at least 32 characters is required for profile auth tests.");
}

const pool = createPool(databaseUrl);
const auth = createCompensaAuth({ allowSignUp: true, database: pool });
const originalPassword = "correct-horse-battery-staple-2026";
const rotatedPassword = "rotated-horse-battery-staple-2026";

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

function cookieFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .filter((value): value is string => value !== undefined)
    .join("; ");
}

describe("self-service profile authentication", () => {
  it("updates the authenticated user's name through Better Auth", async () => {
    const signup = await auth.api.signUpEmail({
      returnHeaders: true,
      body: {
        name: "Nombre Original",
        email: "profile@example.com",
        password: originalPassword,
      },
    });
    const cookie = cookieFrom(signup.headers);

    await auth.api.updateUser({
      headers: new Headers({ cookie }),
      body: { name: "Nombre Actualizado" },
    });

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.name).toBe("Nombre Actualizado");

    const stored = await pool.query("SELECT name, email FROM auth_users WHERE id = $1", [
      signup.response.user.id,
    ]);
    expect(stored.rows[0]).toMatchObject({
      name: "Nombre Actualizado",
      email: "profile@example.com",
    });
  });

  it("rotates the password and revokes another active session", async () => {
    const signup = await auth.api.signUpEmail({
      returnHeaders: true,
      body: {
        name: "Password User",
        email: "password@example.com",
        password: originalPassword,
      },
    });
    const primaryCookie = cookieFrom(signup.headers);

    const secondLogin = await auth.api.signInEmail({
      returnHeaders: true,
      body: { email: "password@example.com", password: originalPassword },
    });
    const secondaryCookie = cookieFrom(secondLogin.headers);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: secondaryCookie }) })).not.toBeNull();

    await auth.api.changePassword({
      headers: new Headers({ cookie: primaryCookie }),
      body: {
        currentPassword: originalPassword,
        newPassword: rotatedPassword,
        revokeOtherSessions: true,
      },
    });

    expect(await auth.api.getSession({ headers: new Headers({ cookie: primaryCookie }) })).not.toBeNull();
    expect(await auth.api.getSession({ headers: new Headers({ cookie: secondaryCookie }) })).toBeNull();

    await expect(
      auth.api.signInEmail({
        body: { email: "password@example.com", password: originalPassword },
      }),
    ).rejects.toBeDefined();

    const newLogin = await auth.api.signInEmail({
      body: { email: "password@example.com", password: rotatedPassword },
    });
    expect(newLogin.user.email).toBe("password@example.com");
  });

  it("rejects a password change when the current password is wrong", async () => {
    const signup = await auth.api.signUpEmail({
      returnHeaders: true,
      body: {
        name: "Wrong Password User",
        email: "wrong-current@example.com",
        password: originalPassword,
      },
    });
    const cookie = cookieFrom(signup.headers);

    await expect(
      auth.api.changePassword({
        headers: new Headers({ cookie }),
        body: {
          currentPassword: "incorrect-current-password-2026",
          newPassword: rotatedPassword,
          revokeOtherSessions: true,
        },
      }),
    ).rejects.toBeDefined();

    const login = await auth.api.signInEmail({
      body: { email: "wrong-current@example.com", password: originalPassword },
    });
    expect(login.user.email).toBe("wrong-current@example.com");
  });
});
