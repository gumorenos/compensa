import { evaluateValuation, type ScoringResult } from "../domain/scoring-engine.js";
import { demoMethodology } from "../fixtures/demo-methodology.js";
import { ValuationService } from "../application/valuation-service.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
  type Job,
  type MethodologyVersion,
  type Organization,
  type ValuationDecision,
} from "../persistence/database.js";
import type { Pool } from "pg";

const DEMO_SLUG = "compensa-demo";

type RuntimeGlobal = typeof globalThis & {
  __compensaPool?: Pool;
  __compensaMigrated?: Promise<void>;
};

export interface DemoContext {
  organization: Organization;
  methodology: MethodologyVersion;
  repository: CompensaRepository;
  service: ValuationService;
  pool: Pool;
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

export interface ValuationPageData {
  organization: Organization;
  job: Job;
  methodology: MethodologyVersion;
  valuationId: string;
  valuationVersion: number;
  valuationStatus: string;
  totalPoints: number | null;
  gradeCode: string | null;
  decisions: ValuationDecision[];
  scoring: ScoringResult | null;
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
  runtime.__compensaMigrated ??= runMigrations(pool);
  await runtime.__compensaMigrated;
}

export async function getDemoContext(): Promise<DemoContext> {
  const pool = poolFromEnvironment();
  await ensureMigrations(pool);
  const repository = new CompensaRepository(pool);
  const service = new ValuationService(repository);

  const { organization, methodology } = await repository.transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "compensa-demo-bootstrap",
    ]);

    const organizationLookup = await client.query(
      "SELECT id FROM organizations WHERE slug = $1",
      [DEMO_SLUG],
    );
    const organizationId = organizationLookup.rows[0]?.id as string | undefined;
    const organization =
      organizationId === undefined
        ? await repository.createOrganization(
            {
              slug: DEMO_SLUG,
              name: "Compensa Demo",
              countryCode: "PE",
              currencyCode: "PEN",
            },
            client,
          )
        : await repository.getOrganization(organizationId, client);

    if (organization === null) {
      throw new Error("Demo organization bootstrap failed.");
    }

    const methodologyLookup = await client.query(
      `SELECT id FROM methodology_versions
       WHERE organization_id = $1 AND code = $2 AND version = $3
       LIMIT 1`,
      [organization.id, demoMethodology.code, demoMethodology.version],
    );
    const methodologyId = methodologyLookup.rows[0]?.id as string | undefined;
    const methodology =
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

    if (methodology === null) {
      throw new Error("Demo methodology bootstrap failed.");
    }

    return { organization, methodology };
  });

  return { organization, methodology, repository, service, pool };
}

export async function listDemoJobs(): Promise<JobListItem[]> {
  const context = await getDemoContext();
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

export async function getDemoJob(jobId: string): Promise<{ context: DemoContext; job: Job } | null> {
  const context = await getDemoContext();
  const job = await context.repository.getJob(context.organization.id, jobId);
  return job === null ? null : { context, job };
}

export async function getValuationPageData(valuationId: string): Promise<ValuationPageData | null> {
  const context = await getDemoContext();
  const snapshot = await context.service.getSnapshot(context.organization.id, valuationId);
  if (snapshot === null) return null;

  const job = await context.repository.getJob(context.organization.id, snapshot.valuation.jobId);
  const methodology = await context.repository.getMethodologyVersionForOrganization(
    context.organization.id,
    snapshot.valuation.methodologyVersionId,
  );
  if (job === null || methodology === null) return null;

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
    valuationId: snapshot.valuation.id,
    valuationVersion: snapshot.valuation.version,
    valuationStatus: snapshot.valuation.status,
    totalPoints: snapshot.valuation.totalPoints,
    gradeCode: snapshot.valuation.gradeCode,
    decisions: snapshot.decisions,
    scoring,
  };
}
