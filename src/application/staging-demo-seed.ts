import type { Pool } from "pg";
import { GoldStandardService } from "./gold-standard-service.js";
import { ValuationService } from "./valuation-service.js";
import {
  CompensaRepository,
  PersistenceError,
  type Job,
  type Valuation,
} from "../persistence/database.js";
import {
  STAGING_DEMO_NOTES,
  STAGING_DEMO_SOURCE_LABEL,
  stagingDemoProfiles,
  type StagingDemoProfile,
} from "../fixtures/staging-demo-data.js";

export interface StagingDemoSeedItemResult {
  code: string;
  valuationId: string;
  status: Valuation["status"];
  createdJob: boolean;
  createdDescription: boolean;
  createdValuation: boolean;
  customized: boolean;
  goldCaseCode: string | null;
  createdGoldCase: boolean;
}

export interface StagingDemoSeedResult {
  organizationId: string;
  organizationSlug: string;
  methodologyVersionId: string;
  items: StagingDemoSeedItemResult[];
}

export async function seedStagingDemo(
  pool: Pool,
  organizationSlug: string,
): Promise<StagingDemoSeedResult> {
  const slug = organizationSlug.trim();
  if (slug === "") {
    throw new PersistenceError("DEMO_ORG_REQUIRED", "A target organization slug is required.");
  }

  const organizationResult = await pool.query(
    "SELECT id FROM organizations WHERE slug = $1 AND status = 'ACTIVE' LIMIT 1",
    [slug],
  );
  const organizationId = organizationResult.rows[0]?.id as string | undefined;
  if (organizationId === undefined) {
    throw new PersistenceError(
      "DEMO_ORG_NOT_FOUND",
      `Active organization ${slug} does not exist. Bootstrap staging before loading demo data.`,
    );
  }

  const methodologyResult = await pool.query(
    `SELECT id
     FROM methodology_versions
     WHERE (organization_id = $1 OR organization_id IS NULL)
       AND code = 'DEMO_POINT_FACTOR'
       AND version = '1.0.0'
       AND status = 'ACTIVE'
     ORDER BY organization_id NULLS LAST
     LIMIT 1`,
    [organizationId],
  );
  const methodologyVersionId = methodologyResult.rows[0]?.id as string | undefined;
  if (methodologyVersionId === undefined) {
    throw new PersistenceError(
      "DEMO_METHODOLOGY_NOT_FOUND",
      "Active DEMO_POINT_FACTOR 1.0.0 methodology is required before loading demo data.",
    );
  }

  const repository = new CompensaRepository(pool);
  const valuations = new ValuationService(repository);
  const gold = new GoldStandardService(pool);
  const items: StagingDemoSeedItemResult[] = [];

  for (const profile of stagingDemoProfiles) {
    const jobState = await ensureJob(pool, repository, organizationId, profile);
    const createdDescription = await ensureSyntheticDescription(
      pool,
      repository,
      organizationId,
      jobState.job.id,
      profile,
    );
    const valuationState = await ensureValuation(
      pool,
      valuations,
      organizationId,
      jobState.job.id,
      methodologyVersionId,
    );

    const customized = await ensureSelectionsWithoutOverwriting(
      repository,
      valuations,
      organizationId,
      valuationState.valuation,
      profile,
    );

    let valuation = await requireValuation(
      repository,
      organizationId,
      valuationState.valuation.id,
    );
    if (!customized) {
      valuation = await advanceTowardTarget(
        valuations,
        organizationId,
        valuation,
        profile,
      );
    }

    let createdGoldCase = false;
    if (profile.goldStandard !== undefined) {
      const existingGold = await pool.query(
        `SELECT id FROM gold_standard_cases
         WHERE organization_id = $1 AND case_code = $2
         LIMIT 1`,
        [organizationId, profile.goldStandard.caseCode],
      );
      if (existingGold.rows.length === 0 && valuation.status === "APPROVED") {
        await gold.captureApprovedValuation(organizationId, valuation.id, {
          caseCode: profile.goldStandard.caseCode,
          anonymizedLabel: profile.goldStandard.label,
          partition: profile.goldStandard.partition,
          isAnchor: profile.goldStandard.isAnchor,
          notes: STAGING_DEMO_NOTES,
        });
        createdGoldCase = true;
      }
    }

    items.push({
      code: profile.code,
      valuationId: valuation.id,
      status: valuation.status,
      createdJob: jobState.created,
      createdDescription,
      createdValuation: valuationState.created,
      customized,
      goldCaseCode: profile.goldStandard?.caseCode ?? null,
      createdGoldCase,
    });
  }

  return { organizationId, organizationSlug: slug, methodologyVersionId, items };
}

async function ensureJob(
  pool: Pool,
  repository: CompensaRepository,
  organizationId: string,
  profile: StagingDemoProfile,
): Promise<{ job: Job; created: boolean }> {
  const existing = await pool.query(
    "SELECT id FROM jobs WHERE organization_id = $1 AND code = $2 LIMIT 1",
    [organizationId, profile.code],
  );
  const existingId = existing.rows[0]?.id as string | undefined;
  if (existingId !== undefined) {
    const job = await repository.getJob(organizationId, existingId);
    if (job === null) {
      throw new PersistenceError("DATABASE_INVARIANT", `Synthetic job ${profile.code} disappeared.`);
    }
    return { job, created: false };
  }

  const job = await repository.createJob(organizationId, {
    code: profile.code,
    name: profile.name,
    department: profile.department,
    area: profile.area,
    jobFamily: profile.jobFamily,
  });
  return { job, created: true };
}

async function ensureSyntheticDescription(
  pool: Pool,
  repository: CompensaRepository,
  organizationId: string,
  jobId: string,
  profile: StagingDemoProfile,
): Promise<boolean> {
  const existing = await pool.query(
    `SELECT id FROM job_description_versions
     WHERE organization_id = $1 AND job_id = $2 AND source_label = $3
     LIMIT 1`,
    [organizationId, jobId, STAGING_DEMO_SOURCE_LABEL],
  );
  if (existing.rows.length > 0) return false;

  await repository.createJobDescriptionVersion(organizationId, jobId, {
    content: profile.description,
    sourceLabel: STAGING_DEMO_SOURCE_LABEL,
  });
  return true;
}

async function ensureValuation(
  pool: Pool,
  service: ValuationService,
  organizationId: string,
  jobId: string,
  methodologyVersionId: string,
): Promise<{ valuation: Valuation; created: boolean }> {
  const existing = await pool.query(
    `SELECT id FROM valuations
     WHERE organization_id = $1 AND job_id = $2 AND methodology_version_id = $3
     ORDER BY version ASC
     LIMIT 1`,
    [organizationId, jobId, methodologyVersionId],
  );
  const existingId = existing.rows[0]?.id as string | undefined;
  if (existingId !== undefined) {
    const snapshot = await service.getSnapshot(organizationId, existingId);
    if (snapshot === null) {
      throw new PersistenceError("DATABASE_INVARIANT", "Synthetic valuation disappeared.");
    }
    return { valuation: snapshot.valuation, created: false };
  }

  return {
    valuation: await service.startValuation(organizationId, jobId, methodologyVersionId),
    created: true,
  };
}

async function ensureSelectionsWithoutOverwriting(
  repository: CompensaRepository,
  service: ValuationService,
  organizationId: string,
  valuation: Valuation,
  profile: StagingDemoProfile,
): Promise<boolean> {
  if (valuation.status !== "DRAFT" && valuation.status !== "RETURNED") return false;

  const existing = await repository.listValuationDecisions(organizationId, valuation.id);
  const byDimension = new Map(existing.map((decision) => [decision.dimensionCode, decision]));

  for (const [dimensionCode, selectedLevelCode] of Object.entries(profile.selections)) {
    const decision = byDimension.get(dimensionCode);
    if (decision !== undefined && decision.selectedLevelCode !== selectedLevelCode) {
      return true;
    }
  }

  for (const [dimensionCode, selectedLevelCode] of Object.entries(profile.selections)) {
    const decision = byDimension.get(dimensionCode);
    const needsJustification = profile.targetStatus !== "DRAFT_PARTIAL";
    const justificationMissing =
      needsJustification && (decision?.justification === null || decision?.justification?.trim() === "");

    if (decision === undefined || justificationMissing) {
      await service.saveDecision(organizationId, valuation.id, {
        dimensionCode,
        selectedLevelCode,
        source: "MANUAL",
        ...(needsJustification
          ? {
              justification: `Referencia sintética para QA: ${profile.code} selecciona ${selectedLevelCode} en ${dimensionCode}.`,
            }
          : {}),
      });
    }
  }

  return false;
}

async function advanceTowardTarget(
  service: ValuationService,
  organizationId: string,
  valuation: Valuation,
  profile: StagingDemoProfile,
): Promise<Valuation> {
  if (profile.targetStatus === "DRAFT_PARTIAL" || profile.targetStatus === "DRAFT_COMPLETE") {
    return valuation;
  }

  let current = valuation;
  if (
    (profile.targetStatus === "IN_REVIEW" ||
      profile.targetStatus === "RETURNED" ||
      profile.targetStatus === "APPROVED") &&
    (current.status === "DRAFT" || current.status === "RETURNED")
  ) {
    current = await service.submitForReview(
      organizationId,
      current.id,
      `Transición sintética para QA (${profile.code}).`,
    );
  }

  if (profile.targetStatus === "RETURNED" && current.status === "IN_REVIEW") {
    return service.returnForChanges(
      organizationId,
      current.id,
      `Devolución sintética para probar correcciones (${profile.code}).`,
    );
  }

  if (profile.targetStatus === "APPROVED" && current.status === "IN_REVIEW") {
    return service.approve(
      organizationId,
      current.id,
      `Aprobación sintética para QA (${profile.code}).`,
    );
  }

  return current;
}

async function requireValuation(
  repository: CompensaRepository,
  organizationId: string,
  valuationId: string,
): Promise<Valuation> {
  const valuation = await repository.getValuation(organizationId, valuationId);
  if (valuation === null) {
    throw new PersistenceError("DATABASE_INVARIANT", "Synthetic valuation disappeared after seeding.");
  }
  return valuation;
}
