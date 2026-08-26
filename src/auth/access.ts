import { cookies, headers } from "next/headers";
import type { Pool } from "pg";
import { createPool } from "../persistence/database.js";
import { auth } from "./server.js";

export type OrganizationRole = "ADMIN" | "EVALUATOR" | "REVIEWER";
export type Permission =
  | "VIEW"
  | "MANAGE_JOBS"
  | "EVALUATE"
  | "SUBMIT_REVIEW"
  | "REVIEW"
  | "MANAGE_MEMBERS"
  | "MANAGE_GOLD_STANDARD"
  | "MANAGE_METHODOLOGIES"
  | "MANAGE_CALIBRATION"
  | "MANAGE_AI_ASSISTANCE";

export interface AccessContext {
  user: {
    id: string;
    name: string;
    email: string;
  };
  organization: {
    id: string;
    slug: string;
    name: string;
    countryCode: string | null;
    currencyCode: string;
  };
  role: OrganizationRole;
}

export interface MembershipSummary {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  role: OrganizationRole;
}

export class AccessError extends Error {
  constructor(
    public readonly code: "AUTH_REQUIRED" | "MEMBERSHIP_REQUIRED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

const rolePermissions: Record<OrganizationRole, ReadonlySet<Permission>> = {
  ADMIN: new Set([
    "VIEW",
    "MANAGE_JOBS",
    "EVALUATE",
    "SUBMIT_REVIEW",
    "REVIEW",
    "MANAGE_MEMBERS",
    "MANAGE_GOLD_STANDARD",
    "MANAGE_METHODOLOGIES",
    "MANAGE_CALIBRATION",
    "MANAGE_AI_ASSISTANCE",
  ]),
  EVALUATOR: new Set(["VIEW", "MANAGE_JOBS", "EVALUATE", "SUBMIT_REVIEW"]),
  REVIEWER: new Set(["VIEW", "REVIEW"]),
};

type AccessGlobal = typeof globalThis & { __compensaAccessPool?: Pool };
type MembershipQueryable = Pick<Pool, "query">;

function accessPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required for Compensa access control.");
  }
  const runtime = globalThis as AccessGlobal;
  runtime.__compensaAccessPool ??= createPool(databaseUrl);
  return runtime.__compensaAccessPool;
}

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export async function listMembershipsForUser(
  userId: string,
  db: MembershipQueryable = accessPool(),
): Promise<MembershipSummary[]> {
  const result = await db.query(
    `SELECT
       m.organization_id,
       m.role,
       o.slug AS organization_slug,
       o.name AS organization_name
     FROM organization_memberships m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = $1
       AND m.status = 'ACTIVE'
       AND o.status = 'ACTIVE'
     ORDER BY o.name, o.id`,
    [userId],
  );

  return result.rows.map((row) => ({
    organizationId: row.organization_id as string,
    organizationSlug: row.organization_slug as string,
    organizationName: row.organization_name as string,
    role: row.role as OrganizationRole,
  }));
}

export async function requireRequestAccess(permission: Permission): Promise<AccessContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    throw new AccessError("AUTH_REQUIRED", "Authentication is required.");
  }

  const memberships = await listMembershipsForUser(session.user.id);
  if (memberships.length === 0) {
    throw new AccessError(
      "MEMBERSHIP_REQUIRED",
      "The authenticated user has no active Compensa organization membership.",
    );
  }

  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get("compensa_active_org")?.value;
  const membership =
    memberships.find((candidate) => candidate.organizationId === requestedOrganizationId) ??
    memberships[0];
  if (membership === undefined) {
    throw new AccessError("MEMBERSHIP_REQUIRED", "No active organization membership was found.");
  }

  if (!roleHasPermission(membership.role, permission)) {
    throw new AccessError(
      "FORBIDDEN",
      `Role ${membership.role} does not have permission ${permission}.`,
    );
  }

  const organizationResult = await accessPool().query(
    `SELECT id, slug, name, country_code, currency_code
     FROM organizations
     WHERE id = $1 AND status = 'ACTIVE'`,
    [membership.organizationId],
  );
  const organization = organizationResult.rows[0] as
    | {
        id: string;
        slug: string;
        name: string;
        country_code: string | null;
        currency_code: string;
      }
    | undefined;
  if (organization === undefined) {
    throw new AccessError("MEMBERSHIP_REQUIRED", "The selected organization is not active.");
  }

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      countryCode: organization.country_code,
      currencyCode: organization.currency_code,
    },
    role: membership.role,
  };
}
