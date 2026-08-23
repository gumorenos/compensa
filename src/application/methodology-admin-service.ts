import type { Pool, PoolClient } from "pg";
import {
  CompensaRepository,
  PersistenceError,
  type MethodologyVersion,
} from "../persistence/database.js";
import {
  previewMethodologyImport,
  type MethodologyImportPreview,
} from "./methodology-import.js";

export interface MethodologyAdminPreview extends MethodologyImportPreview {
  duplicate: boolean;
}

export class MethodologyAdminService {
  private readonly repository: CompensaRepository;

  constructor(private readonly pool: Pool) {
    this.repository = new CompensaRepository(pool);
  }

  async listAvailable(
    organizationId: string,
    options: { activeOnly?: boolean } = {},
  ): Promise<MethodologyVersion[]> {
    const result = await this.pool.query(
      `SELECT * FROM methodology_versions
       WHERE (organization_id = $1 OR organization_id IS NULL)
         AND ($2::boolean = false OR status = 'ACTIVE')
       ORDER BY
         CASE WHEN organization_id = $1 THEN 0 ELSE 1 END,
         name, code, version, created_at`,
      [organizationId, options.activeOnly ?? false],
    );
    return result.rows.map(mapMethodologyVersionRow);
  }

  async preview(organizationId: string, input: unknown): Promise<MethodologyAdminPreview> {
    const preview = previewMethodologyImport(input);
    if (preview.definition === null) return { ...preview, duplicate: false };

    const duplicate = await this.organizationVersionExists(
      organizationId,
      preview.definition.code,
      preview.definition.version,
      this.pool,
    );
    if (!duplicate) return { ...preview, duplicate: false };

    return {
      ...preview,
      status: "INVALID",
      duplicate: true,
      issues: [
        ...preview.issues,
        {
          code: "METHODOLOGY_VERSION_EXISTS",
          message: `Methodology ${preview.definition.code} version ${preview.definition.version} already exists in this organization. Create a new version instead of overwriting it.`,
          path: "$.version",
        },
      ],
    };
  }

  async importActive(
    organizationId: string,
    input: unknown,
    contentOwner: string,
  ): Promise<MethodologyVersion> {
    const owner = contentOwner.trim();
    if (owner === "") {
      throw new PersistenceError(
        "METHODOLOGY_CONTENT_OWNER_REQUIRED",
        "Content owner / authorized source is required.",
      );
    }

    return this.repository.transaction(async (client) => {
      const structural = previewMethodologyImport(input);
      if (structural.definition === null || structural.status !== "VALID") {
        throw invalidPreview(structural);
      }

      await lockMethodologyVersion(
        client,
        organizationId,
        structural.definition.code,
        structural.definition.version,
      );
      const duplicate = await this.organizationVersionExists(
        organizationId,
        structural.definition.code,
        structural.definition.version,
        client,
      );
      if (duplicate) {
        throw new PersistenceError(
          "METHODOLOGY_VERSION_EXISTS",
          `Methodology ${structural.definition.code} version ${structural.definition.version} already exists in this organization.`,
        );
      }

      return this.repository.createMethodologyVersion(
        {
          organizationId,
          definition: structural.definition,
          contentOwner: owner,
          status: "ACTIVE",
        },
        client,
      );
    });
  }

  private async organizationVersionExists(
    organizationId: string,
    code: string,
    version: string,
    db: Pick<Pool | PoolClient, "query">,
  ): Promise<boolean> {
    const result = await db.query(
      `SELECT 1 FROM methodology_versions
       WHERE organization_id = $1 AND code = $2 AND version = $3
       LIMIT 1`,
      [organizationId, code, version],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}

function invalidPreview(preview: MethodologyImportPreview): PersistenceError {
  return new PersistenceError(
    "INVALID_METHODOLOGY",
    preview.issues.length === 0
      ? "Methodology definition is invalid."
      : preview.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "),
  );
}

async function lockMethodologyVersion(
  client: PoolClient,
  organizationId: string,
  code: string,
  version: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `methodology-version:${organizationId}:${code}:${version}`,
  ]);
}

interface MethodologyVersionRow {
  id: string;
  organization_id: string | null;
  code: string;
  name: string;
  version: string;
  definition: MethodologyVersion["definition"];
  content_owner: string;
  status: MethodologyVersion["status"];
  created_at: Date;
}

function mapMethodologyVersionRow(row: unknown): MethodologyVersion {
  const value = row as MethodologyVersionRow;
  return {
    id: value.id,
    organizationId: value.organization_id,
    code: value.code,
    name: value.name,
    version: value.version,
    definition: value.definition,
    contentOwner: value.content_owner,
    status: value.status,
    createdAt: value.created_at,
  };
}
