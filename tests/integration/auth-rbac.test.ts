import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ValuationService } from "../../src/application/valuation-service.js";
import {
  listMembershipsForUser,
  roleHasPermission,
  type OrganizationRole,
  type Permission,
} from "../../src/auth/access.js";
import { createCompensaAuth } from "../../src/auth/server.js";
import {
  demoMethodology,
  demoMidLevelSelections,
} from "../../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for authentication integration tests.");
}
if (process.env.BETTER_AUTH_SECRET === undefined || process.env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error("BETTER_AUTH_SECRET with at least 32 characters is required for authentication tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const service = new ValuationService(repository);

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

async function createAuthUser(email: string, name = "Test User") {
  const bootstrapAuth = createCompensaAuth({ allowSignUp: true });
  const { headers, response } = await bootstrapAuth.api.signUpEmail({
    returnHeaders: true,
    body: {
      name,
      email,
      password: "correct-horse-battery-staple-2026",
    },
  });

  const user = response.user;
  const cookie = headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .filter((value): value is string => value !== undefined)
    .join("; ");

  return { auth: bootstrapAuth, user, cookie };
}

async function addMembership(
  organizationId: string,
  userId: string,
  role: OrganizationRole,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): Promise<void> {
  await pool.query(
    `INSERT INTO organization_memberships
      (id, organization_id, user_id, role, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), organizationId, userId, role, status],
  );
}

describe("authentication and RBAC", () => {
  it("creates an account through the controlled bootstrap path and resolves its server session", async () => {
    const { auth, user, cookie } = await createAuthUser("admin@example.com", "Admin Test");

    expect(user.email).toBe("admin@example.com");
    expect(cookie).toContain("compensa.session_token=");

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });

    expect(session?.user.id).toBe(user.id);
    expect(session?.user.email).toBe("admin@example.com");
    expect(session?.session.userId).toBe(user.id);

    const rows = await pool.query(
      "SELECT count(*)::int AS count FROM auth_sessions WHERE user_id = $1",
      [user.id],
    );
    expect(rows.rows[0]?.count).toBeGreaterThan(0);
  });

  it("keeps public email sign-up disabled in the production auth configuration", async () => {
    const lockedAuth = createCompensaAuth();

    await expect(
      lockedAuth.api.signUpEmail({
        body: {
          name: "Should Not Exist",
          email: "blocked@example.com",
          password: "correct-horse-battery-staple-2026",
        },
      }),
    ).rejects.toBeDefined();

    const result = await pool.query(
      "SELECT count(*)::int AS count FROM auth_users WHERE email = $1",
      ["blocked@example.com"],
    );
    expect(result.rows[0]?.count).toBe(0);
  });

  it("returns only active memberships in active organizations", async () => {
    const { user } = await createAuthUser("member@example.com");
    const activeOrg = await repository.createOrganization({
      slug: "active-org",
      name: "Active Organization",
      currencyCode: "PEN",
    });
    const inactiveMembershipOrg = await repository.createOrganization({
      slug: "inactive-membership-org",
      name: "Inactive Membership Organization",
      currencyCode: "PEN",
    });
    const inactiveOrg = await repository.createOrganization({
      slug: "inactive-org",
      name: "Inactive Organization",
      currencyCode: "PEN",
    });

    await addMembership(activeOrg.id, user.id, "EVALUATOR");
    await addMembership(inactiveMembershipOrg.id, user.id, "REVIEWER", "INACTIVE");
    await addMembership(inactiveOrg.id, user.id, "ADMIN");
    await pool.query("UPDATE organizations SET status = 'INACTIVE' WHERE id = $1", [inactiveOrg.id]);

    expect(await listMembershipsForUser(user.id)).toEqual([
      {
        organizationId: activeOrg.id,
        organizationSlug: "active-org",
        organizationName: "Active Organization",
        role: "EVALUATOR",
      },
    ]);
  });

  it("implements the intended permission matrix", () => {
    const permissions: Permission[] = [
      "VIEW",
      "MANAGE_JOBS",
      "EVALUATE",
      "SUBMIT_REVIEW",
      "REVIEW",
      "MANAGE_MEMBERS",
    ];

    const expected: Record<OrganizationRole, Permission[]> = {
      ADMIN: permissions,
      EVALUATOR: ["VIEW", "MANAGE_JOBS", "EVALUATE", "SUBMIT_REVIEW"],
      REVIEWER: ["VIEW", "REVIEW"],
    };

    for (const role of Object.keys(expected) as OrganizationRole[]) {
      for (const permission of permissions) {
        expect(roleHasPermission(role, permission)).toBe(expected[role].includes(permission));
      }
    }
  });

  it("stores submit, return and approval actors atomically with review actions", async () => {
    const evaluator = await createAuthUser("evaluator@example.com", "Evaluator");
    const reviewer = await createAuthUser("reviewer@example.com", "Reviewer");
    const organization = await repository.createOrganization({
      slug: "audit-org",
      name: "Audit Organization",
      currencyCode: "PEN",
    });
    await addMembership(organization.id, evaluator.user.id, "EVALUATOR");
    await addMembership(organization.id, reviewer.user.id, "REVIEWER");

    const job = await repository.createJob(organization.id, { name: "Jefe de Planeamiento" });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Compensa demo",
      status: "ACTIVE",
    });
    const valuation = await service.startValuation(organization.id, job.id, methodology.id);

    for (const [dimensionCode, selectedLevelCode] of Object.entries(demoMidLevelSelections)) {
      await service.saveDecision(organization.id, valuation.id, {
        dimensionCode,
        selectedLevelCode,
      });
      await service.saveDecisionSupport(organization.id, valuation.id, {
        dimensionCode,
        justification: `Justificación experta para ${dimensionCode}`,
      });
    }

    await service.submitForReview(
      organization.id,
      valuation.id,
      "Primera revisión",
      evaluator.user.id,
    );
    await service.returnForChanges(
      organization.id,
      valuation.id,
      "Ajustar fundamento",
      reviewer.user.id,
    );
    await service.submitForReview(
      organization.id,
      valuation.id,
      "Reenvío",
      evaluator.user.id,
    );
    await service.approve(
      organization.id,
      valuation.id,
      "Conforme",
      reviewer.user.id,
    );

    const result = await pool.query(
      `SELECT action, actor_user_id
       FROM valuation_review_actions
       WHERE organization_id = $1 AND valuation_id = $2
       ORDER BY created_at, id`,
      [organization.id, valuation.id],
    );

    expect(result.rows).toEqual([
      { action: "SUBMITTED", actor_user_id: evaluator.user.id },
      { action: "RETURNED", actor_user_id: reviewer.user.id },
      { action: "SUBMITTED", actor_user_id: evaluator.user.id },
      { action: "APPROVED", actor_user_id: reviewer.user.id },
    ]);
  });
});
