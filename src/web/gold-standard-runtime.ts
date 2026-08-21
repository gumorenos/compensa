import { GoldStandardService } from "../application/gold-standard-service.js";
import { roleHasPermission } from "../auth/access.js";
import { GoldStandardRepository, type GoldStandardCase, type GoldStandardCaseBundle } from "../persistence/gold-standard.js";
import type { Job, MethodologyVersion, Valuation } from "../persistence/database.js";
import { getAppContext, type AppContext } from "./runtime.js";

export interface GoldStandardCandidate {
  valuationId: string;
  valuationVersion: number;
  jobId: string;
  jobCode: string | null;
  jobName: string;
  department: string | null;
  totalPoints: number;
  gradeCode: string;
  methodologyName: string;
  methodologyVersion: string;
  approvedAt: Date | null;
}

export interface GoldStandardListPageData {
  context: AppContext;
  cases: GoldStandardCase[];
  candidates: GoldStandardCandidate[];
  canManage: boolean;
}

export interface GoldStandardCasePageData {
  context: AppContext;
  bundle: GoldStandardCaseBundle;
  canManage: boolean;
}

export interface GoldStandardCapturePageData {
  context: AppContext;
  valuation: Valuation;
  job: Job;
  methodology: MethodologyVersion;
  existingCase: GoldStandardCase | null;
}

export async function getGoldStandardListPageData(): Promise<GoldStandardListPageData> {
  const context = await getAppContext("VIEW");
  const service = new GoldStandardService(context.pool);
  const cases = await service.listCases(context.organization.id);
  const canManage = roleHasPermission(context.access.role, "MANAGE_GOLD_STANDARD");

  let candidates: GoldStandardCandidate[] = [];
  if (canManage) {
    const result = await context.pool.query(
      `SELECT
         v.id AS valuation_id,
         v.version AS valuation_version,
         v.total_points,
         v.grade_code,
         j.id AS job_id,
         j.code AS job_code,
         j.name AS job_name,
         j.department,
         m.name AS methodology_name,
         m.version AS methodology_version,
         approved.created_at AS approved_at
       FROM valuations v
       JOIN jobs j
         ON j.id = v.job_id
        AND j.organization_id = v.organization_id
       JOIN methodology_versions m
         ON m.id = v.methodology_version_id
       LEFT JOIN LATERAL (
         SELECT created_at
         FROM valuation_review_actions r
         WHERE r.organization_id = v.organization_id
           AND r.valuation_id = v.id
           AND r.action = 'APPROVED'
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT 1
       ) approved ON true
       LEFT JOIN gold_standard_cases g
         ON g.organization_id = v.organization_id
        AND g.source_valuation_id = v.id
       WHERE v.organization_id = $1
         AND v.status = 'APPROVED'
         AND v.total_points IS NOT NULL
         AND v.grade_code IS NOT NULL
         AND g.id IS NULL
       ORDER BY approved.created_at DESC NULLS LAST, j.name, v.version DESC`,
      [context.organization.id],
    );

    candidates = result.rows.map((row) => ({
      valuationId: row.valuation_id as string,
      valuationVersion: Number(row.valuation_version),
      jobId: row.job_id as string,
      jobCode: row.job_code as string | null,
      jobName: row.job_name as string,
      department: row.department as string | null,
      totalPoints: Number(row.total_points),
      gradeCode: row.grade_code as string,
      methodologyName: row.methodology_name as string,
      methodologyVersion: row.methodology_version as string,
      approvedAt: row.approved_at as Date | null,
    }));
  }

  return { context, cases, candidates, canManage };
}

export async function getGoldStandardCasePageData(
  caseId: string,
): Promise<GoldStandardCasePageData | null> {
  const context = await getAppContext("VIEW");
  const service = new GoldStandardService(context.pool);
  const bundle = await service.getCase(context.organization.id, caseId);
  if (bundle === null) return null;

  return {
    context,
    bundle,
    canManage: roleHasPermission(context.access.role, "MANAGE_GOLD_STANDARD"),
  };
}

export async function getGoldStandardCapturePageData(
  valuationId: string,
): Promise<GoldStandardCapturePageData | null> {
  const context = await getAppContext("MANAGE_GOLD_STANDARD");
  const valuation = await context.repository.getValuation(context.organization.id, valuationId);
  if (valuation === null) return null;
  if (
    valuation.status !== "APPROVED" ||
    valuation.totalPoints === null ||
    valuation.gradeCode === null
  ) {
    return null;
  }

  const job = await context.repository.getJob(context.organization.id, valuation.jobId);
  const methodology = await context.repository.getMethodologyVersionForOrganization(
    context.organization.id,
    valuation.methodologyVersionId,
  );
  if (job === null || methodology === null) return null;

  const goldRepository = new GoldStandardRepository(context.pool);
  const existingCase = await goldRepository.getCaseBySourceValuation(
    context.organization.id,
    valuation.id,
  );

  return { context, valuation, job, methodology, existingCase };
}
