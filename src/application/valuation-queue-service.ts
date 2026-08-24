import type { Pool } from "pg";

export const valuationStatuses = [
  "DRAFT",
  "IN_REVIEW",
  "RETURNED",
  "APPROVED",
  "SUPERSEDED",
  "CANCELLED",
] as const;

export type ValuationQueueStatus = (typeof valuationStatuses)[number];

export interface ValuationQueueFilters {
  status: ValuationQueueStatus | null;
  area: string | null;
  jobFamily: string | null;
  gradeCode: string | null;
  methodologyVersionId: string | null;
  actorUserId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  query: string | null;
}

export interface ValuationQueueStarter {
  id: string;
  name: string;
  email: string;
}

export interface ValuationQueueItem {
  valuationId: string;
  valuationVersion: number;
  status: ValuationQueueStatus;
  totalPoints: number | null;
  gradeCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  jobId: string;
  jobCode: string | null;
  jobName: string;
  department: string | null;
  area: string | null;
  jobFamily: string | null;
  methodologyVersionId: string;
  methodologyCode: string;
  methodologyName: string;
  methodologyVersion: string;
  startedBy: ValuationQueueStarter | null;
}

export interface ValuationQueueMethodologyOption {
  id: string;
  code: string;
  name: string;
  version: string;
}

export interface ValuationQueueActorOption {
  id: string;
  name: string;
  email: string;
}

export interface ValuationQueueOptions {
  areas: string[];
  jobFamilies: string[];
  gradeCodes: string[];
  methodologies: ValuationQueueMethodologyOption[];
  actors: ValuationQueueActorOption[];
}

export interface ValuationQueueResult {
  items: ValuationQueueItem[];
  totalMatching: number;
  truncated: boolean;
  statusCounts: Record<ValuationQueueStatus, number>;
  options: ValuationQueueOptions;
}

interface QueueRow {
  valuation_id: string;
  valuation_version: number;
  valuation_status: ValuationQueueStatus;
  total_points: string | number | null;
  grade_code: string | null;
  created_at: Date;
  updated_at: Date;
  job_id: string;
  job_code: string | null;
  job_name: string;
  department: string | null;
  area: string | null;
  job_family: string | null;
  methodology_version_id: string;
  methodology_code: string;
  methodology_name: string;
  methodology_version: string;
  starter_id: string | null;
  starter_name: string | null;
  starter_email: string | null;
  total_matching: string | number;
}

interface StatusCountRow {
  status: ValuationQueueStatus;
  count: string | number;
}

const MAX_RESULTS = 200;

export class ValuationQueueService {
  constructor(private readonly pool: Pool) {}

  async getQueue(
    organizationId: string,
    filters: ValuationQueueFilters = emptyValuationQueueFilters(),
  ): Promise<ValuationQueueResult> {
    const params = filterParams(organizationId, filters);
    const [itemsResult, statusResult, options] = await Promise.all([
      this.pool.query(
        `${baseSelect()}
         ${filterWhere()}
         ORDER BY v.updated_at DESC, j.name, v.version DESC
         LIMIT ${MAX_RESULTS + 1}`,
        params,
      ),
      this.pool.query(
        `SELECT status, count(*)::int AS count
         FROM valuations
         WHERE organization_id = $1
         GROUP BY status`,
        [organizationId],
      ),
      this.loadOptions(organizationId),
    ]);

    const rows = itemsResult.rows as QueueRow[];
    const totalMatching = rows.length === 0 ? 0 : Number(rows[0]?.total_matching ?? 0);
    const truncated = rows.length > MAX_RESULTS;
    const visibleRows = truncated ? rows.slice(0, MAX_RESULTS) : rows;
    const statusCounts = emptyStatusCounts();
    for (const row of statusResult.rows as StatusCountRow[]) {
      statusCounts[row.status] = Number(row.count);
    }

    return {
      items: visibleRows.map(queueItemFromRow),
      totalMatching,
      truncated,
      statusCounts,
      options,
    };
  }

  private async loadOptions(organizationId: string): Promise<ValuationQueueOptions> {
    const [textOptions, methodologies, actors] = await Promise.all([
      this.pool.query(
        `SELECT
           array_remove(array_agg(DISTINCT nullif(btrim(j.area), '') ORDER BY nullif(btrim(j.area), '')), NULL) AS areas,
           array_remove(array_agg(DISTINCT nullif(btrim(j.job_family), '') ORDER BY nullif(btrim(j.job_family), '')), NULL) AS job_families,
           array_remove(array_agg(DISTINCT nullif(btrim(v.grade_code), '') ORDER BY nullif(btrim(v.grade_code), '')), NULL) AS grade_codes
         FROM valuations v
         JOIN jobs j
           ON j.id = v.job_id
          AND j.organization_id = v.organization_id
         WHERE v.organization_id = $1`,
        [organizationId],
      ),
      this.pool.query(
        `SELECT DISTINCT m.id, m.code, m.name, m.version
         FROM valuations v
         JOIN methodology_versions m ON m.id = v.methodology_version_id
         WHERE v.organization_id = $1
         ORDER BY m.name, m.code, m.version`,
        [organizationId],
      ),
      this.pool.query(
        `SELECT DISTINCT starter.actor_user_id AS id, u.name, u.email
         FROM valuations v
         JOIN LATERAL (
           SELECT s.actor_user_id
           FROM security_audit_events s
           WHERE s.organization_id = v.organization_id
             AND s.action = 'VALUATION_STARTED'
             AND s.resource_type = 'VALUATION'
             AND s.resource_id = v.id::text
             AND s.actor_user_id IS NOT NULL
           ORDER BY s.id ASC
           LIMIT 1
         ) starter ON true
         JOIN auth_users u ON u.id = starter.actor_user_id
         WHERE v.organization_id = $1
         ORDER BY u.name, u.email`,
        [organizationId],
      ),
    ]);

    const textRow = textOptions.rows[0] as
      | { areas?: string[] | null; job_families?: string[] | null; grade_codes?: string[] | null }
      | undefined;
    return {
      areas: textRow?.areas ?? [],
      jobFamilies: textRow?.job_families ?? [],
      gradeCodes: textRow?.grade_codes ?? [],
      methodologies: methodologies.rows.map((row) => ({
        id: row.id as string,
        code: row.code as string,
        name: row.name as string,
        version: row.version as string,
      })),
      actors: actors.rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        email: row.email as string,
      })),
    };
  }
}

export function emptyValuationQueueFilters(): ValuationQueueFilters {
  return {
    status: null,
    area: null,
    jobFamily: null,
    gradeCode: null,
    methodologyVersionId: null,
    actorUserId: null,
    dateFrom: null,
    dateTo: null,
    query: null,
  };
}

export type ValuationQueueFilterInput = Record<string, string | string[] | undefined>;

export class ValuationQueueFilterError extends Error {
  constructor(public readonly field: string) {
    super(`Invalid valuation queue filter: ${field}.`);
    this.name = "ValuationQueueFilterError";
  }
}

export function parseValuationQueueFilters(input: ValuationQueueFilterInput): ValuationQueueFilters {
  const statusValue = optionalInput(input.status);
  const methodologyVersionId = optionalInput(input.methodologyVersionId);
  const actorUserId = optionalInput(input.actorUserId);
  const dateFrom = optionalInput(input.dateFrom);
  const dateTo = optionalInput(input.dateTo);

  if (statusValue !== null && !isValuationStatus(statusValue)) {
    throw new ValuationQueueFilterError("status");
  }
  if (methodologyVersionId !== null && !isUuid(methodologyVersionId)) {
    throw new ValuationQueueFilterError("methodologyVersionId");
  }
  if (actorUserId !== null && !isUuid(actorUserId)) {
    throw new ValuationQueueFilterError("actorUserId");
  }
  if (dateFrom !== null && !isIsoDate(dateFrom)) {
    throw new ValuationQueueFilterError("dateFrom");
  }
  if (dateTo !== null && !isIsoDate(dateTo)) {
    throw new ValuationQueueFilterError("dateTo");
  }
  if (dateFrom !== null && dateTo !== null && dateFrom > dateTo) {
    throw new ValuationQueueFilterError("dateRange");
  }

  return {
    status: statusValue,
    area: boundedText(input.area, "area"),
    jobFamily: boundedText(input.jobFamily, "jobFamily"),
    gradeCode: boundedText(input.gradeCode, "gradeCode"),
    methodologyVersionId,
    actorUserId,
    dateFrom,
    dateTo,
    query: boundedText(input.q, "q"),
  };
}

function baseSelect(): string {
  return `SELECT
    v.id AS valuation_id,
    v.version AS valuation_version,
    v.status AS valuation_status,
    v.total_points,
    v.grade_code,
    v.created_at,
    v.updated_at,
    j.id AS job_id,
    j.code AS job_code,
    j.name AS job_name,
    j.department,
    j.area,
    j.job_family,
    m.id AS methodology_version_id,
    m.code AS methodology_code,
    m.name AS methodology_name,
    m.version AS methodology_version,
    starter.actor_user_id AS starter_id,
    starter.name AS starter_name,
    starter.email AS starter_email,
    count(*) OVER()::int AS total_matching
  FROM valuations v
  JOIN jobs j
    ON j.id = v.job_id
   AND j.organization_id = v.organization_id
  JOIN methodology_versions m ON m.id = v.methodology_version_id
  LEFT JOIN LATERAL (
    SELECT s.actor_user_id, u.name, u.email
    FROM security_audit_events s
    LEFT JOIN auth_users u ON u.id = s.actor_user_id
    WHERE s.organization_id = v.organization_id
      AND s.action = 'VALUATION_STARTED'
      AND s.resource_type = 'VALUATION'
      AND s.resource_id = v.id::text
    ORDER BY s.id ASC
    LIMIT 1
  ) starter ON true`;
}

function filterWhere(): string {
  return `WHERE v.organization_id = $1
    AND ($2::text IS NULL OR v.status = $2)
    AND ($3::text IS NULL OR j.area = $3)
    AND ($4::text IS NULL OR j.job_family = $4)
    AND ($5::text IS NULL OR v.grade_code = $5)
    AND ($6::uuid IS NULL OR v.methodology_version_id = $6)
    AND ($7::uuid IS NULL OR starter.actor_user_id = $7)
    AND ($8::date IS NULL OR v.updated_at >= ($8::date::timestamp AT TIME ZONE 'UTC'))
    AND ($9::date IS NULL OR v.updated_at < (($9::date + 1)::timestamp AT TIME ZONE 'UTC'))
    AND (
      $10::text IS NULL
      OR j.name ILIKE ('%' || $10 || '%')
      OR coalesce(j.code, '') ILIKE ('%' || $10 || '%')
    )`;
}

function filterParams(organizationId: string, filters: ValuationQueueFilters): unknown[] {
  return [
    organizationId,
    filters.status,
    filters.area,
    filters.jobFamily,
    filters.gradeCode,
    filters.methodologyVersionId,
    filters.actorUserId,
    filters.dateFrom,
    filters.dateTo,
    filters.query,
  ];
}

function queueItemFromRow(row: QueueRow): ValuationQueueItem {
  const hasStarter =
    row.starter_id !== null && row.starter_name !== null && row.starter_email !== null;
  return {
    valuationId: row.valuation_id,
    valuationVersion: Number(row.valuation_version),
    status: row.valuation_status,
    totalPoints: row.total_points === null ? null : Number(row.total_points),
    gradeCode: row.grade_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobId: row.job_id,
    jobCode: row.job_code,
    jobName: row.job_name,
    department: row.department,
    area: row.area,
    jobFamily: row.job_family,
    methodologyVersionId: row.methodology_version_id,
    methodologyCode: row.methodology_code,
    methodologyName: row.methodology_name,
    methodologyVersion: row.methodology_version,
    startedBy: hasStarter
      ? { id: row.starter_id!, name: row.starter_name!, email: row.starter_email! }
      : null,
  };
}

function emptyStatusCounts(): Record<ValuationQueueStatus, number> {
  return {
    DRAFT: 0,
    IN_REVIEW: 0,
    RETURNED: 0,
    APPROVED: 0,
    SUPERSEDED: 0,
    CANCELLED: 0,
  };
}

function optionalInput(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined) return null;
  const trimmed = first.trim();
  return trimmed === "" ? null : trimmed;
}

function boundedText(value: string | string[] | undefined, field: string): string | null {
  const normalized = optionalInput(value);
  if (normalized !== null && normalized.length > 200) {
    throw new ValuationQueueFilterError(field);
  }
  return normalized;
}

function isValuationStatus(value: string): value is ValuationQueueStatus {
  return (valuationStatuses as readonly string[]).includes(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
