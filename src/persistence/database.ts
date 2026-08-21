import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { validateMethodology } from "../domain/scoring-engine.js";
import type { MethodologyDefinition } from "../domain/methodology.js";

export type Queryable = Pool | PoolClient;

export class PersistenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  countryCode: string | null;
  currencyCode: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

export interface Job {
  id: string;
  organizationId: string;
  code: string | null;
  name: string;
  department: string | null;
  area: string | null;
  jobFamily: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

export interface MethodologyVersion {
  id: string;
  organizationId: string | null;
  code: string;
  name: string;
  version: string;
  definition: MethodologyDefinition;
  contentOwner: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  createdAt: Date;
}

export type ValuationStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "RETURNED"
  | "APPROVED"
  | "SUPERSEDED"
  | "CANCELLED";

export interface Valuation {
  id: string;
  organizationId: string;
  jobId: string;
  methodologyVersionId: string;
  version: number;
  status: ValuationStatus;
  totalPoints: number | null;
  gradeCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DecisionSource = "MANUAL" | "AI_ACCEPTED" | "AI_MODIFIED" | "IMPORT";

export interface ValuationDecision {
  id: string;
  organizationId: string;
  valuationId: string;
  dimensionCode: string;
  selectedLevelCode: string;
  source: DecisionSource;
  justification: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  country_code: string | null;
  currency_code: string;
  status: "ACTIVE" | "INACTIVE";
  created_at: Date;
  updated_at: Date;
}

interface JobRow {
  id: string;
  organization_id: string;
  code: string | null;
  name: string;
  department: string | null;
  area: string | null;
  job_family: string | null;
  status: "ACTIVE" | "INACTIVE";
  created_at: Date;
  updated_at: Date;
}

interface MethodologyVersionRow {
  id: string;
  organization_id: string | null;
  code: string;
  name: string;
  version: string;
  definition: MethodologyDefinition;
  content_owner: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  created_at: Date;
}

interface ValuationRow {
  id: string;
  organization_id: string;
  job_id: string;
  methodology_version_id: string;
  version: number;
  status: ValuationStatus;
  total_points: string | number | null;
  grade_code: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ValuationDecisionRow {
  id: string;
  organization_id: string;
  valuation_id: string;
  dimension_code: string;
  selected_level_code: string;
  source: DecisionSource;
  justification: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateOrganizationInput {
  slug: string;
  name: string;
  countryCode?: string | null;
  currencyCode: string;
}

export interface CreateJobInput {
  code?: string | null;
  name: string;
  department?: string | null;
  area?: string | null;
  jobFamily?: string | null;
}

export interface CreateMethodologyVersionInput {
  organizationId: string | null;
  definition: MethodologyDefinition;
  contentOwner: string;
  status?: "DRAFT" | "ACTIVE";
}

export interface UpsertDecisionInput {
  dimensionCode: string;
  selectedLevelCode: string;
  source?: DecisionSource;
  justification?: string | null;
}

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}

export async function runMigrations(
  pool: Pool,
  migrationsUrl: URL = new URL("../../migrations/", import.meta.url),
): Promise<void> {
  const directory = fileURLToPath(migrationsUrl);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const name of files) {
    const sql = await readFile(new URL(name, migrationsUrl), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [9182401]);
      const applied = await client.query(
        "SELECT checksum FROM schema_migrations WHERE name = $1",
        [name],
      );
      const row = applied.rows[0] as { checksum: string } | undefined;

      if (row !== undefined) {
        if (row.checksum !== checksum) {
          throw new PersistenceError(
            "MIGRATION_CHECKSUM_MISMATCH",
            `Migration ${name} was already applied with a different checksum.`,
          );
        }
        await client.query("COMMIT");
        continue;
      }

      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export class CompensaRepository {
  constructor(private readonly pool: Pool) {}

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createOrganization(input: CreateOrganizationInput, db: Queryable = this.pool): Promise<Organization> {
    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO organizations (id, slug, name, country_code, currency_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, input.slug, input.name, input.countryCode ?? null, input.currencyCode],
    );
    return mapOrganization(requiredRow<OrganizationRow>(result.rows[0], "organization insert"));
  }

  async getOrganization(id: string, db: Queryable = this.pool): Promise<Organization | null> {
    const result = await db.query("SELECT * FROM organizations WHERE id = $1", [id]);
    const row = result.rows[0] as OrganizationRow | undefined;
    return row === undefined ? null : mapOrganization(row);
  }

  async createJob(
    organizationId: string,
    input: CreateJobInput,
    db: Queryable = this.pool,
  ): Promise<Job> {
    await this.requireOrganization(organizationId, db);
    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO jobs (id, organization_id, code, name, department, area, job_family)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        organizationId,
        input.code ?? null,
        input.name,
        input.department ?? null,
        input.area ?? null,
        input.jobFamily ?? null,
      ],
    );
    return mapJob(requiredRow<JobRow>(result.rows[0], "job insert"));
  }

  async getJob(organizationId: string, jobId: string, db: Queryable = this.pool): Promise<Job | null> {
    const result = await db.query(
      "SELECT * FROM jobs WHERE id = $1 AND organization_id = $2",
      [jobId, organizationId],
    );
    const row = result.rows[0] as JobRow | undefined;
    return row === undefined ? null : mapJob(row);
  }

  async createMethodologyVersion(
    input: CreateMethodologyVersionInput,
    db: Queryable = this.pool,
  ): Promise<MethodologyVersion> {
    const errors = validateMethodology(input.definition);
    if (errors.length > 0) {
      throw new PersistenceError(
        "INVALID_METHODOLOGY",
        errors.map((error) => `${error.code}: ${error.message}`).join("; "),
      );
    }

    if (input.organizationId !== null) {
      await this.requireOrganization(input.organizationId, db);
    }

    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO methodology_versions
        (id, organization_id, code, name, version, definition, content_owner, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       RETURNING *`,
      [
        id,
        input.organizationId,
        input.definition.code,
        input.definition.name,
        input.definition.version,
        JSON.stringify(input.definition),
        input.contentOwner,
        input.status ?? "ACTIVE",
      ],
    );
    return mapMethodologyVersion(
      requiredRow<MethodologyVersionRow>(result.rows[0], "methodology version insert"),
    );
  }

  async getMethodologyVersionForOrganization(
    organizationId: string,
    methodologyVersionId: string,
    db: Queryable = this.pool,
  ): Promise<MethodologyVersion | null> {
    const result = await db.query(
      `SELECT * FROM methodology_versions
       WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL)`,
      [methodologyVersionId, organizationId],
    );
    const row = result.rows[0] as MethodologyVersionRow | undefined;
    return row === undefined ? null : mapMethodologyVersion(row);
  }

  async startValuation(
    organizationId: string,
    jobId: string,
    methodologyVersionId: string,
  ): Promise<Valuation> {
    return this.transaction(async (client) => {
      const job = await this.getJob(organizationId, jobId, client);
      if (job === null) {
        throw new PersistenceError("JOB_NOT_FOUND", "Job does not exist in this organization.");
      }

      const methodology = await this.getMethodologyVersionForOrganization(
        organizationId,
        methodologyVersionId,
        client,
      );
      if (methodology === null) {
        throw new PersistenceError(
          "METHODOLOGY_NOT_FOUND",
          "Methodology version is not available to this organization.",
        );
      }

      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `valuation:${jobId}`,
      ]);
      const versionResult = await client.query(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM valuations WHERE job_id = $1",
        [jobId],
      );
      const versionRow = requiredRow<{ next_version: string | number }>(
        versionResult.rows[0],
        "valuation version allocation",
      );
      const version = Number(versionRow.next_version);
      const id = randomUUID();
      const result = await client.query(
        `INSERT INTO valuations
          (id, organization_id, job_id, methodology_version_id, version)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, organizationId, jobId, methodologyVersionId, version],
      );
      const valuation = mapValuation(requiredRow<ValuationRow>(result.rows[0], "valuation insert"));

      await this.appendValuationEvent(
        organizationId,
        valuation.id,
        "VALUATION_CREATED",
        { version, methodologyVersionId },
        client,
      );
      return valuation;
    });
  }

  async getValuation(
    organizationId: string,
    valuationId: string,
    db: Queryable = this.pool,
  ): Promise<Valuation | null> {
    const result = await db.query(
      "SELECT * FROM valuations WHERE id = $1 AND organization_id = $2",
      [valuationId, organizationId],
    );
    const row = result.rows[0] as ValuationRow | undefined;
    return row === undefined ? null : mapValuation(row);
  }

  async listValuationDecisions(
    organizationId: string,
    valuationId: string,
    db: Queryable = this.pool,
  ): Promise<ValuationDecision[]> {
    const result = await db.query(
      `SELECT * FROM valuation_decisions
       WHERE valuation_id = $1 AND organization_id = $2
       ORDER BY dimension_code`,
      [valuationId, organizationId],
    );
    return (result.rows as ValuationDecisionRow[]).map(mapValuationDecision);
  }

  async upsertValuationDecision(
    organizationId: string,
    valuationId: string,
    input: UpsertDecisionInput,
    db: Queryable = this.pool,
  ): Promise<ValuationDecision> {
    const id = randomUUID();
    const result = await db.query(
      `INSERT INTO valuation_decisions
        (id, organization_id, valuation_id, dimension_code, selected_level_code, source, justification)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (valuation_id, dimension_code)
       DO UPDATE SET
         selected_level_code = EXCLUDED.selected_level_code,
         source = EXCLUDED.source,
         justification = EXCLUDED.justification,
         updated_at = now()
       RETURNING *`,
      [
        id,
        organizationId,
        valuationId,
        input.dimensionCode,
        input.selectedLevelCode,
        input.source ?? "MANUAL",
        input.justification ?? null,
      ],
    );
    return mapValuationDecision(
      requiredRow<ValuationDecisionRow>(result.rows[0], "valuation decision upsert"),
    );
  }

  async updateValuationResult(
    organizationId: string,
    valuationId: string,
    points: number | null,
    gradeCode: string | null,
    db: Queryable = this.pool,
  ): Promise<Valuation> {
    const result = await db.query(
      `UPDATE valuations
       SET total_points = $3, grade_code = $4, updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [valuationId, organizationId, points, gradeCode],
    );
    const row = result.rows[0] as ValuationRow | undefined;
    if (row === undefined) {
      throw new PersistenceError("VALUATION_NOT_FOUND", "Valuation does not exist in this organization.");
    }
    return mapValuation(row);
  }

  async appendValuationEvent(
    organizationId: string,
    valuationId: string,
    action: string,
    payload: Record<string, unknown>,
    db: Queryable = this.pool,
  ): Promise<void> {
    await db.query(
      `INSERT INTO valuation_events (organization_id, valuation_id, action, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [organizationId, valuationId, action, JSON.stringify(payload)],
    );
  }

  private async requireOrganization(organizationId: string, db: Queryable): Promise<void> {
    const organization = await this.getOrganization(organizationId, db);
    if (organization === null) {
      throw new PersistenceError("ORGANIZATION_NOT_FOUND", "Organization does not exist.");
    }
  }
}

function requiredRow<T>(value: unknown, context: string): T {
  if (value === undefined || value === null) {
    throw new PersistenceError("DATABASE_INVARIANT", `Database returned no row for ${context}.`);
  }
  return value as T;
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    countryCode: row.country_code,
    currencyCode: row.currency_code,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    department: row.department,
    area: row.area,
    jobFamily: row.job_family,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMethodologyVersion(row: MethodologyVersionRow): MethodologyVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    version: row.version,
    definition: row.definition,
    contentOwner: row.content_owner,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapValuation(row: ValuationRow): Valuation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    jobId: row.job_id,
    methodologyVersionId: row.methodology_version_id,
    version: Number(row.version),
    status: row.status,
    totalPoints: row.total_points === null ? null : Number(row.total_points),
    gradeCode: row.grade_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapValuationDecision(row: ValuationDecisionRow): ValuationDecision {
  return {
    id: row.id,
    organizationId: row.organization_id,
    valuationId: row.valuation_id,
    dimensionCode: row.dimension_code,
    selectedLevelCode: row.selected_level_code,
    source: row.source,
    justification: row.justification,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
