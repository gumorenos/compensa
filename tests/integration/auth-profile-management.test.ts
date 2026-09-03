import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCompensaAuth } from "../../src/auth/server.js";
import { createPool, runMigrations } from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for profile integration tests.");
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error("BETTER_AUTH_SECRET with at least 32 characters is required for profile integration tests.");
}

const pool = createPool(databaseUrl);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE organization_memberships, auth_sessions, auth_accounts,
      auth_verifications, auth_users, organizations RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

async function createUser(email: string, password = "correct-horse-battery-staple-2026") {
  const auth = createCompensaAuth({ allowSignUp: true, database: pool });
  const { headers, response } = await auth.api.signUpEmail({
    returnHeaders: true,
    body: { email, password, name: "Profile User" },
  });
  const cookie = headers
    .getSetCookie()
    .map((header) => header.split(";", 1)[0])
    .filter((item): item is string => item !== undefined)
    .join("; ");
  return { auth, user: response.user, cookie, password };
}

function requestHeaders(cookie: string): Headers {
  return new Headers({ cookie });
}

describe("Better Auth profile management", () => {
  it("updates the signed-in user's name without tenant membership", async () => {
    const { auth, user, cookie } = await createUser("profile-name@example.com");

    await auth.api.updateUser({
      body: { name: "Nombre Actualizado" },
      headers: requestHeaders(cookie),
    });

    const dbUser = await pool.query("SELECT name FROM auth_users WHERE id = $1", [user.id]);
    expect(dbUser.rows[0]?.name).toBe("Nombre Actualizado");
    const session = await auth.api.getSession({ headers: requestHeaders(cookie) });
    expect(session?.user.name).toBe("Nombre Actualizado");
  });

  it("changes password, rejects the old one, and revokes other sessions", async () => {
    const { auth, user, cookie, password } = await createUser("profile-password@example.com");
    const secondLogin = await auth.api.signInEmail({
      returnHeaders: true,
      body: { email: user.email, password },
    });
    const secondCookie = secondLogin.headers
      .getSetCookie()
      .map((header) => header.split(";", 1)[0])
      .filter((item): item is string => item !== undefined)
      .join("; ");

    const before = await pool.query("SELECT count(*)::int AS count FROM auth_sessions WHERE user_id = $1", [user.id]);
    expect(before.rows[0]?.count).toBeGreaterThanOrEqual(2);

    const newPassword = "new-correct-horse-battery-staple-2026";
    await auth.api.changePassword({
      body: { currentPassword: password, newPassword, revokeOtherSessions: true },
      headers: requestHeaders(cookie),
    });

    const after = await pool.query("SELECT count(*)::int AS count FROM auth_sessions WHERE user_id = $1", [user.id]);
    expect(after.rows[0]?.count).toBe(1);
    expect(await auth.api.getSession({ headers: requestHeaders(cookie) })).not.toBeNull();
    expect(await auth.api.getSession({ headers: requestHeaders(secondCookie) })).toBeNull();

    await expect(
      auth.api.signInEmail({ body: { email: user.email, password } }),
    ).rejects.toBeDefined();
    const login = await auth.api.signInEmail({ body: { email: user.email, password: newPassword } });
    expect(login.user.id).toBe(user.id);
  });

  it("changes an unverified email only after the current password is verified", async () => {
    const { auth, user, cookie, password } = await createUser("profile-email@example.com");
    expect(user.emailVerified).toBe(false);

    await expect(
      auth.api.verifyPassword({
        body: { password: "wrong-current-password" },
        headers: requestHeaders(cookie),
      }),
    ).rejects.toBeDefined();

    await auth.api.verifyPassword({
      body: { password },
      headers: requestHeaders(cookie),
    });
    await auth.api.changeEmail({
      body: { newEmail: "profile-email-updated@example.com", callbackURL: "/profile" },
      headers: requestHeaders(cookie),
    });

    const dbUser = await pool.query("SELECT email, email_verified FROM auth_users WHERE id = $1", [user.id]);
    expect(dbUser.rows[0]).toMatchObject({
      email: "profile-email-updated@example.com",
      email_verified: false,
    });
    const session = await auth.api.getSession({ headers: requestHeaders(cookie) });
    expect(session?.user.email).toBe("profile-email-updated@example.com");
  });
});
