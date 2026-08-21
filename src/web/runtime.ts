import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { ValuationService } from "../application/valuation-service.js";
import {
  requireRequestAccess,
  roleHasPermission,
  type AccessContext,
  type Permission,
} from "../auth/access.js";
import { evaluateValuation, type ScoringResult } from "../domain/scoring-engine.js";
import { demoMethodology } from "../fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
  type Job,
  type JobDescriptionVersion,
  type MethodologyVersion,
  type Organization,
  type ValuationDecision,
  type ValuationEvidence,
} from "../persistence/database.js";

type RuntimeGlobal = typeof globalThis & {
  __compensaPool?: Pool;
  __compensaMigrated?: Promise<void>;
};

export interface AppCapabilities {
  canManageJobs: boolean;
  canEvaluate: boolean;
  canSubmitReview: boolean;
  canReview: boolean;
  canManageMembers: boolean;
}

export interface AppContext {
  organization: Organization;
  methodology: MethodologyVersion;
  repository: CompensaRepository;
  service: ValuationService;
  pool: Pool;
  access: AccessContext;
  capabilities: AppCapabilities;
}

export interface JobListItem {
  id: string;
  code: string | null;
  name: string;
  department: string | null;
  area: string | null;
  jobFamily: string | null;
  status: "ACTIVE" | "INACTIVE";
  totalPoints: number | null;
  gradeCode: string | null;
  valuationStatus: string | null;
}

export interface JobPageData {
  context: AppContext;
  job: Job;
  latestDescription: JobDescriptionVersion | null;
}

export interface ReviewActionView {
  id: string;
  organizationId: string;
  valuationId: string;
  action: "SUBMITTED" | "RETURNED" | "APPROVED";
  comment: string | null;
  createdAt: Date;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface ValuationPageData {
  organization: Organization;
  job: Job;
  methodology: MethodologyVersion;
  description: JobDescriptionVersion | null;
  valuationId: string;
  valuationVersion: number;
  valuationStatus: string;
  totalPoints: number | null;
  gradeCode: string | null;
  decisions: ValuationDecision[];
  evidence: ValuationEvidence[];
  reviewActions: ReviewActionView[];
  scoring: ScoringResult | null;
  capabilities: AppCapabilities;
}

function poolFromEnvironment(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required to run the Compensa web application.");
  }

  const runtime = globalThis as RuntimeGlobal;
  if (runtime.__compensaPool === undefined) {
    runtime.__compensaPool = createPool(databaseUrl);
  }
  return runtime.__compensaPool;
}

async function ensureMigrations(pool: Pool): Promise<void> {
  const runtime = globalThis as RuntimeGlobal;
  const migrationsDirectory = pathToFileURL(`${resolve(process.cwd(), "migrations")}${sep}`);
  runtime.__compensaMigrated ??= runMigrations(pool, migrationsDirectory);
  await runtime.__compensaMigrated;
}

function capabilitiesFor(access: AccessContext): AppCapabilities {
  return {
    canManageJobs: roleHasPermission(access.role, "MANAGE_JOBS"),
    canEvaluate: roleHasPermission(access.role, "EVALUATE"),
    canSubmitReview: roleHasPermission(access.role, "SUBMIT_REVIEW"),
    canReview: roleHasPermission(access.role, "REVIEW"),
    canManageMembers: roleHasPermission(access.role, "MANAGE_MEMBERS"),
  };
}

export async function getAppContext(permission: Permission = "VIEW"): Promise<AppContext> {
  const pool = poolFromEnvironment();
  await ensureMigrations(pool);
  const access = await requireRequestAccess(permission);
  const repository = new CompensaRepository(pool);
  const service = new ValuationService(repository);
  const organization = await repository.getOrganization(access.organization.id);
  if (organization === null || organization.status !== "ACTIVE") {
    throw new Error("The active organization is not available.");
  }

  const methodology = await repository.transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `compensa-methodology-bootstrap:${organization.id}`,
    ]);
    const methodologyLookup = await client.query(
      `SELECT id FROM methodology_versions
       WHERE organization_id = $1 AND code = $2 AND version = $3
       LIMIT 1`,
      [organization.id, demoMethodology.code, demoMethodology.version],
    );
    const methodologyId = methodologyLookup.rows[0]?.id as string | undefined;
    const value =
      methodologyId === undefined
        ? await repository.createMethodologyVersion(
            {
              organizationId: organization.id,
              definition: demoMethodology,
              contentOwner: "Compensa demo fixture",
              status: "ACTIVE",
            },
            client,
          )
        : await repository.getMethodologyVersionForOrganization(
            organization.id,
            methodologyId,
            client,
          );
    if (value === null) {
      throw new Error("Methodology bootstrap failed for the active organization.");
    }
    return value;
  });

  return {
    organization,
    methodology,
    repository,
    service,
    pool,
    access,
    capabilities: capabilitiesFor(access),
  };
}

export async function appendSecurityAuditEvent(
  context: AppContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await context.pool.query(
    `INSERT INTO security_audit_events
      (organization_id, actor_user_id, action, resource_type, resource_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      context.organization.id,
      context.access.user.id,
      action,
      resourceType,
      resourceId,
      JSON.stringify(payload),
    ],
  );
}

export async function attachActorToLatestReviewAction(
  context: AppContext,
  valuationId: string,
  action: "SUBMITTED" | "RETURNED" | "APPROVED",
): Promise<void> {
  await context.pool.query(
    `UPDATE valuation_review_actions
     SET actor_user_id = $3
     WHERE id = (
       SELECT id
       FROM valuation_review_actions
       WHERE organization_id = $1
         AND valuation_id = $2
         AND action = $4
         AND actor_user_id IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     )`,
    [context.organization.id, valuationId, context.access.user.id, action],
  );
}

export async function listDemoJobs(): Promise<JobListItem[]> {
  const context = await getAppContext("VIEW");
  const result = await context.pool.query(
    `SELECT
       j.id,
       j.code,
       j.name,
       j.department,
       j.area,
       j.job_family,
       j.status,
       latest.total_points,
       latest.grade_code,
       latest.status AS valuation_status
     FROM jobs j
     LEFT JOIN LATERAL (
       SELECT v.total_points, v.grade_code, v.status, v.version
       FROM valuations v
       WHERE v.job_id = j.id AND v.organization_id = j.organization_id
       ORDER BY v.version DESC
       LIMIT 1
     ) latest ON true
     WHERE j.organization_id = $1
     ORDER BY j.name`,
    [context.organization.id],
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    code: row.code as string | null,
    name: row.name as string,
    department: row.department as string | null,
    area: row.area as string | null,
    jobFamily: row.job_family as string | null,
    status: row.status as "ACTIVE" | "INACTIVE",
    totalPoints: row.total_points === null ? null : Number(row.total_points),
    gradeCode: row.grade_code as string | null,
    valuationStatus: row.valuation_status as string | null,
  }));
}

export async function getDemoJob(jobId: string): Promise<JobPageData | null> {
  const context = await getAppContext("VIEW");
  const job = await context.repository.getJob(context.organization.id, jobId);
  if (job === null) return null;
  const latestDescription = await context.repository.getLatestJobDescription(
    context.organization.id,
    jobId,
  );
  return { context, job, latestDescription };
}

export async function getValuationPageData(valuationId: string): Promise<ValuationPageData | null> {
  const context = await getAppContext("VIEW");
  const snapshot = await context.service.getSnapshot(context.organization.id, valuationId);
  if (snapshot === null) return null;

  const job = await context.repository.getJob(context.organization.id, snapshot.valuation.jobId);
  const methodology = await context.repository.getMethodologyVersionForOrganization(
    context.organization.id,
    snapshot.valuation.methodologyVersionId,
  );
  if (job === null || methodology === null) return null;

  const description =
    snapshot.valuation.jobDescriptionVersionId === null
      ? null
      : await context.repository.getJobDescriptionVersion(
          context.organization.id,
          snapshot.valuation.jobDescriptionVersionId,
        );
  const evidence = await context.repository.listValuationEvidence(
    context.organization.id,
    valuationId,
  );
  const reviewResult = await context.pool.query(
    `SELECT
       r.id,
       r.organization_id,
       r.valuation_id,
       r.action,
       r.comment,
       r.created_at,
       r.actor_user_id,
       u.name AS actor_name,
       u.email AS actor_email
     FROM valuation_review_actions r
     LEFT JOIN auth_users u ON u.id = r.actor_user_id
     WHERE r.organization_id = $1 AND r.valuation_id = $2
     ORDER BY r.created_at, r.id`,
    [context.organization.id, valuationId],
  );
  const reviewActions: ReviewActionView[] = reviewResult.rows.map((row) => ({
    id: row.id as string,
    organizationId: row.organization_id as string,
    valuationId: row.valuation_id as string,
    action: row.action as ReviewActionView["action"],
    comment: row.comment as string | null,
    createdAt: row.created_at as Date,
    actor:
      row.actor_user_id === null
        ? null
        : {
            id: row.actor_user_id as string,
            name: row.actor_name as string,
            email: row.actor_email as string,
          },
  }));

  let scoring: ScoringResult | null = null;
  if (snapshot.complete) {
    const selections = Object.fromEntries(
      snapshot.decisions.map((decision) => [decision.dimensionCode, decision.selectedLevelCode]),
    );
    const result = evaluateValuation(methodology.definition, selections);
    scoring = result.status === "SUCCESS" ? result : null;
  }

  return {
    organization: context.organization,
    job,
    methodology,
    description,
    valuationId: snapshot.valuation.id,
    valuationVersion: snapshot.valuation.version,
    valuationStatus: snapshot.valuation.status,
    totalPoints: snapshot.valuation.totalPoints,
    gradeCode: snapshot.valuation.gradeCode,
    decisions: snapshot.decisions,
    evidence,
    reviewActions,
    scoring,
    capabilities: context.capabilities,
  };
}
