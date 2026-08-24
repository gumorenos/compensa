import type { Pool } from "pg";
import {
  valuationStatuses,
  type ValuationQueueStatus,
} from "./valuation-queue-service.js";

export interface OperationalOverviewMetrics {
  activeJobs: number;
  jobsWithoutApprovedValuation: number;
  incompleteEditableValuations: number;
  statusCounts: Record<ValuationQueueStatus, number>;
}

export interface RecentOperationalValuation {
  valuationId: string;
  valuationVersion: number;
  status: ValuationQueueStatus;
  totalPoints: number | null;
  gradeCode: string | null;
  updatedAt: Date;
  jobId: string;
  jobCode: string | null;
  jobName: string;
  area: string | null;
  jobFamily: string | null;
  methodologyVersionId: string;
  methodologyCode: string;
  methodologyName: string;
  methodologyVersion: string;
}

export interface OperationalOverview {
  metrics: OperationalOverviewMetrics;
  recentValuations: RecentOperationalValuation[];
}

interface MetricsRow {
  active_jobs: string | number;
  jobs_without_approved_valuation: string | number;
  incomplete_editable_valuations: string | number;
  draft_count: string | number;
  in_review_count: string | number;
  returned_count: string | number;
  approved_count: string | number;
  superseded_count: string | number;
  cancelled_count: string | number;
}

interface RecentValuationRow {
  valuation_id: string;
  valuation_version: number;
  valuation_status: ValuationQueueStatus;
  total_points: string | number | null;
  grade_code: string | null;
  updated_at: Date;
  job_id: string;
  job_code: string | null;
  job_name: string;
  area: string | null;
  job_family: string | null;
  methodology_version_id: string;
  methodology_code: string;
  methodology_name: string;
  methodology_version: string;
}

const RECENT_LIMIT = 8;

export class OperationalOverviewService {
  constructor(private readonly pool: Pool) {}

  async getOverview(organizationId: string): Promise<OperationalOverview> {
    const [metricsResult, recentResult] = await Promise.all([
      this.pool.query(
        `SELECT
           (SELECT count(*)::int
            FROM jobs j
            WHERE j.organization_id = $1
              AND j.status = 'ACTIVE') AS active_jobs,
           (SELECT count(*)::int
            FROM jobs j
            WHERE j.organization_id = $1
              AND j.status = 'ACTIVE'
              AND NOT EXISTS (
                SELECT 1
                FROM valuations v
                WHERE v.organization_id = j.organization_id
                  AND v.job_id = j.id
                  AND v.status = 'APPROVED'
              )) AS jobs_without_approved_valuation,
           count(*) FILTER (
             WHERE v.status IN ('DRAFT', 'RETURNED')
               AND v.total_points IS NULL
           )::int AS incomplete_editable_valuations,
           count(*) FILTER (WHERE v.status = 'DRAFT')::int AS draft_count,
           count(*) FILTER (WHERE v.status = 'IN_REVIEW')::int AS in_review_count,
           count(*) FILTER (WHERE v.status = 'RETURNED')::int AS returned_count,
           count(*) FILTER (WHERE v.status = 'APPROVED')::int AS approved_count,
           count(*) FILTER (WHERE v.status = 'SUPERSEDED')::int AS superseded_count,
           count(*) FILTER (WHERE v.status = 'CANCELLED')::int AS cancelled_count
         FROM valuations v
         WHERE v.organization_id = $1`,
        [organizationId],
      ),
      this.pool.query(
        `SELECT
           v.id AS valuation_id,
           v.version AS valuation_version,
           v.status AS valuation_status,
           v.total_points,
           v.grade_code,
           v.updated_at,
           j.id AS job_id,
           j.code AS job_code,
           j.name AS job_name,
           j.area,
           j.job_family,
           m.id AS methodology_version_id,
           m.code AS methodology_code,
           m.name AS methodology_name,
           m.version AS methodology_version
         FROM valuations v
         JOIN jobs j
           ON j.id = v.job_id
          AND j.organization_id = v.organization_id
         JOIN methodology_versions m ON m.id = v.methodology_version_id
         WHERE v.organization_id = $1
         ORDER BY v.updated_at DESC, v.id DESC
         LIMIT ${RECENT_LIMIT}`,
        [organizationId],
      ),
    ]);

    const row = metricsResult.rows[0] as MetricsRow | undefined;
    const metrics: OperationalOverviewMetrics = {
      activeJobs: Number(row?.active_jobs ?? 0),
      jobsWithoutApprovedValuation: Number(row?.jobs_without_approved_valuation ?? 0),
      incompleteEditableValuations: Number(row?.incomplete_editable_valuations ?? 0),
      statusCounts: {
        DRAFT: Number(row?.draft_count ?? 0),
        IN_REVIEW: Number(row?.in_review_count ?? 0),
        RETURNED: Number(row?.returned_count ?? 0),
        APPROVED: Number(row?.approved_count ?? 0),
        SUPERSEDED: Number(row?.superseded_count ?? 0),
        CANCELLED: Number(row?.cancelled_count ?? 0),
      },
    };

    for (const status of valuationStatuses) {
      if (!Number.isFinite(metrics.statusCounts[status])) {
        metrics.statusCounts[status] = 0;
      }
    }

    return {
      metrics,
      recentValuations: (recentResult.rows as RecentValuationRow[]).map((recent) => ({
        valuationId: recent.valuation_id,
        valuationVersion: Number(recent.valuation_version),
        status: recent.valuation_status,
        totalPoints: recent.total_points === null ? null : Number(recent.total_points),
        gradeCode: recent.grade_code,
        updatedAt: recent.updated_at,
        jobId: recent.job_id,
        jobCode: recent.job_code,
        jobName: recent.job_name,
        area: recent.area,
        jobFamily: recent.job_family,
        methodologyVersionId: recent.methodology_version_id,
        methodologyCode: recent.methodology_code,
        methodologyName: recent.methodology_name,
        methodologyVersion: recent.methodology_version,
      })),
    };
  }
}
