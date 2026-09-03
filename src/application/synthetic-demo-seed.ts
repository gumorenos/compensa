import type { Pool } from "pg";
import { GoldStandardService } from "./gold-standard-service.js";
import { assertSyntheticDemoOrganizationSlug } from "./synthetic-demo-seed-guard.js";
import { ValuationService } from "./valuation-service.js";
import { demoMethodology } from "../fixtures/demo-methodology.js";
import {
  SYNTHETIC_DEMO_MARKER,
  syntheticDemoJobs,
  syntheticJustification,
  type SyntheticDemoJob,
} from "../fixtures/synthetic-demo-data.js";
import { CompensaRepository, PersistenceError, type Valuation } from "../persistence/database.js";

export interface SyntheticDemoSeedResult {
  organizationId: string;
  jobs: number;
  valuations: number;
  goldStandardCases: number;
}

export async function seedSyntheticDemoData(
  pool: Pool,
  organizationSlug: string,
): Promise<SyntheticDemoSeedResult> {
  assertSyntheticDemoOrganizationSlug(organizationSlug);
  const orgResult = await pool.query("SELECT id FROM organizations WHERE slug = $1", [organizationSlug]);
  const organizationId = orgResult.rows[0]?.id as string | undefined;
  if (organizationId === undefined) {
    throw new PersistenceError("DEMO_ORG_NOT_FOUND", `Organization ${organizationSlug} does not exist.`);
  }

  const methodologyResult = await pool.query(
    `SELECT id FROM methodology_versions
     WHERE organization_id = $1 AND code = $2 AND version = $3 AND status = 'ACTIVE'
     LIMIT 1`,
    [organizationId, demoMethodology.code, demoMethodology.version],
  );
  const methodologyVersionId = methodologyResult.rows[0]?.id as string | undefined;
  if (methodologyVersionId === undefined) {
    throw new PersistenceError(
      "DEMO_METHODOLOGY_NOT_FOUND",
      `Active ${demoMethodology.code} ${demoMethodology.version} is required before seeding demo data.`,
    );
  }

  const repository = new CompensaRepository(pool);
  const valuationService = new ValuationService(repository);
  const goldService = new GoldStandardService(pool);

  for (const definition of syntheticDemoJobs) {
    const jobId = await ensureJob(pool, repository, organizationId, definition);
    await ensureDescription(repository, organizationId, jobId, definition);
    const valuation = await ensureSingleValuation(
      pool,
      valuationService,
      organizationId,
      jobId,
      methodologyVersionId,
    );
    await ensureDecisions(repository, valuationService, organizationId, valuation, definition);
    await assertSafeWorkflowContinuation(pool, organizationId, valuation, definition);
    const finalValuation = await advanceValuation(valuationService, organizationId, valuation.id, definition);
    if (definition.goldStandard !== undefined) {
      await ensureGoldStandard(pool, goldService, organizationId, finalValuation, definition);
    }
  }

  const counts = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM jobs WHERE organization_id = $1 AND code LIKE 'SYN-DEMO-%') AS jobs,
       (SELECT count(*)::int FROM valuations v JOIN jobs j ON j.id = v.job_id
          WHERE v.organization_id = $1 AND j.code LIKE 'SYN-DEMO-%') AS valuations,
       (SELECT count(*)::int FROM gold_standard_cases
          WHERE organization_id = $1 AND case_code LIKE 'SYN-GS-%') AS gold_cases`,
    [organizationId],
  );
  const row = counts.rows[0] as { jobs: number; valuations: number; gold_cases: number };
  return {
    organizationId,
    jobs: Number(row.jobs),
    valuations: Number(row.valuations),
    goldStandardCases: Number(row.gold_cases),
  };
}

async function ensureJob(
  pool: Pool,
  repository: CompensaRepository,
  organizationId: string,
  definition: SyntheticDemoJob,
): Promise<string> {
  const existing = await pool.query(
    "SELECT id FROM jobs WHERE organization_id = $1 AND code = $2",
    [organizationId, definition.code],
  );
  const jobId = existing.rows[0]?.id as string | undefined;
  if (jobId !== undefined) {
    const job = await repository.getJob(organizationId, jobId);
    if (
      job === null ||
      job.name !== definition.name ||
      job.department !== definition.department ||
      job.area !== definition.area ||
      job.jobFamily !== definition.jobFamily ||
      job.status !== "ACTIVE"
    ) {
      throw new PersistenceError(
        "DEMO_JOB_COLLISION",
        `Job code ${definition.code} exists but no longer matches the synthetic fixture.`,
      );
    }
    return jobId;
  }
  const job = await repository.createJob(organizationId, {
    code: definition.code,
    name: definition.name,
    department: definition.department,
    area: definition.area,
    jobFamily: definition.jobFamily,
  });
  return job.id;
}

async function ensureDescription(
  repository: CompensaRepository,
  organizationId: string,
  jobId: string,
  definition: SyntheticDemoJob,
): Promise<void> {
  const latest = await repository.getLatestJobDescription(organizationId, jobId);
  if (latest === null) {
    await repository.createJobDescriptionVersion(organizationId, jobId, {
      content: definition.description,
      sourceLabel: SYNTHETIC_DEMO_MARKER,
    });
    return;
  }
  if (latest.sourceLabel !== SYNTHETIC_DEMO_MARKER || latest.content !== definition.description) {
    throw new PersistenceError(
      "DEMO_DESCRIPTION_COLLISION",
      `Synthetic job ${definition.code} already has a non-matching description.`,
    );
  }
}

async function ensureSingleValuation(
  pool: Pool,
  service: ValuationService,
  organizationId: string,
  jobId: string,
  methodologyVersionId: string,
): Promise<Valuation> {
  const result = await pool.query(
    "SELECT id FROM valuations WHERE organization_id = $1 AND job_id = $2 ORDER BY version",
    [organizationId, jobId],
  );
  if (result.rowCount === 0) {
    return service.startValuation(organizationId, jobId, methodologyVersionId);
  }
  if (result.rowCount !== 1) {
    throw new PersistenceError("DEMO_VALUATION_COLLISION", `Synthetic job ${jobId} has multiple valuations.`);
  }
  const valuation = await service.getSnapshot(organizationId, result.rows[0]!.id as string);
  if (valuation === null) throw new PersistenceError("DEMO_VALUATION_MISSING", "Synthetic valuation disappeared.");
  if (valuation.valuation.methodologyVersionId !== methodologyVersionId) {
    throw new PersistenceError("DEMO_METHODOLOGY_COLLISION", "Synthetic valuation uses another methodology.");
  }
  return valuation.valuation;
}

async function ensureDecisions(
  repository: CompensaRepository,
  service: ValuationService,
  organizationId: string,
  valuation: Valuation,
  definition: SyntheticDemoJob,
): Promise<void> {
  const existing = await repository.listValuationDecisions(organizationId, valuation.id);
  const byDimension = new Map(existing.map((decision) => [decision.dimensionCode, decision]));
  for (const [dimensionCode, selectedLevelCode] of Object.entries(definition.selections)) {
    const current = byDimension.get(dimensionCode);
    if (current !== undefined && current.selectedLevelCode !== selectedLevelCode) {
      throw new PersistenceError("DEMO_DECISION_COLLISION", `${definition.code}/${dimensionCode} was modified.`);
    }
    if (current === undefined) {
      if (valuation.status !== "DRAFT" && valuation.status !== "RETURNED") {
        throw new PersistenceError("DEMO_DECISION_MISSING", `${definition.code}/${dimensionCode} is missing in ${valuation.status}.`);
      }
      await service.saveDecision(organizationId, valuation.id, {
        dimensionCode,
        selectedLevelCode,
        source: "MANUAL",
      });
    }
  }

  if (definition.targetStatus === "DRAFT_INCOMPLETE") return;
  const refreshed = await repository.listValuationDecisions(organizationId, valuation.id);
  for (const decision of refreshed) {
    const expected = syntheticJustification(definition, decision.dimensionCode);
    if (decision.justification === expected) continue;
    if (decision.justification !== null) {
      throw new PersistenceError("DEMO_JUSTIFICATION_COLLISION", `${definition.code}/${decision.dimensionCode} was modified.`);
    }
    if (valuation.status !== "DRAFT" && valuation.status !== "RETURNED") {
      throw new PersistenceError("DEMO_JUSTIFICATION_MISSING", `${definition.code}/${decision.dimensionCode} lacks demo justification.`);
    }
    await service.saveDecisionSupport(organizationId, valuation.id, {
      dimensionCode: decision.dimensionCode,
      justification: expected,
    });
  }
}

async function assertSafeWorkflowContinuation(
  pool: Pool,
  organizationId: string,
  valuation: Valuation,
  definition: SyntheticDemoJob,
): Promise<void> {
  const expectedStatus = expectedPersistentStatus(definition);
  if (valuation.status === expectedStatus) return;

  const history = await pool.query(
    `SELECT action, comment
     FROM valuation_review_actions
     WHERE organization_id = $1 AND valuation_id = $2
     ORDER BY created_at, id`,
    [organizationId, valuation.id],
  );

  if (valuation.status === "DRAFT" && history.rows.length === 0) return;

  const canResumeSyntheticSubmission =
    valuation.status === "IN_REVIEW" &&
    (definition.targetStatus === "RETURNED" || definition.targetStatus === "APPROVED") &&
    history.rows.length === 1 &&
    history.rows[0]?.action === "SUBMITTED" &&
    history.rows[0]?.comment === "Synthetic QA submission";
  if (canResumeSyntheticSubmission) return;

  throw new PersistenceError(
    "DEMO_STATUS_COLLISION",
    `${definition.code} expected ${expectedStatus}, found ${valuation.status}; manual workflow state is preserved.`,
  );
}

function expectedPersistentStatus(definition: SyntheticDemoJob): Valuation["status"] {
  if (definition.targetStatus === "DRAFT_INCOMPLETE" || definition.targetStatus === "DRAFT_COMPLETE") {
    return "DRAFT";
  }
  return definition.targetStatus;
}

async function advanceValuation(
  service: ValuationService,
  organizationId: string,
  valuationId: string,
  definition: SyntheticDemoJob,
): Promise<Valuation> {
  const snapshot = await service.getSnapshot(organizationId, valuationId);
  if (snapshot === null) throw new PersistenceError("DEMO_VALUATION_MISSING", "Synthetic valuation disappeared.");
  let current = snapshot.valuation;

  if (definition.targetStatus === "DRAFT_INCOMPLETE" || definition.targetStatus === "DRAFT_COMPLETE") {
    if (current.status !== "DRAFT") {
      throw new PersistenceError("DEMO_STATUS_COLLISION", `${definition.code} expected DRAFT, found ${current.status}.`);
    }
    return current;
  }

  if (definition.targetStatus === "RETURNED") {
    if (current.status === "DRAFT") current = await service.submitForReview(organizationId, valuationId, "Synthetic QA submission");
    if (current.status === "IN_REVIEW") current = await service.returnForChanges(organizationId, valuationId, "Synthetic QA return for changes");
    if (current.status !== "RETURNED") throw new PersistenceError("DEMO_STATUS_COLLISION", `${definition.code} expected RETURNED, found ${current.status}.`);
    return current;
  }

  if (current.status === "DRAFT" || current.status === "RETURNED") {
    current = await service.submitForReview(organizationId, valuationId, "Synthetic QA submission");
  }
  if (definition.targetStatus === "IN_REVIEW") {
    if (current.status !== "IN_REVIEW") throw new PersistenceError("DEMO_STATUS_COLLISION", `${definition.code} expected IN_REVIEW, found ${current.status}.`);
    return current;
  }
  if (current.status === "IN_REVIEW") {
    current = await service.approve(organizationId, valuationId, "Synthetic QA approval");
  }
  if (current.status !== "APPROVED") throw new PersistenceError("DEMO_STATUS_COLLISION", `${definition.code} expected APPROVED, found ${current.status}.`);
  return current;
}

async function ensureGoldStandard(
  pool: Pool,
  service: GoldStandardService,
  organizationId: string,
  valuation: Valuation,
  definition: SyntheticDemoJob,
): Promise<void> {
  const gold = definition.goldStandard!;
  const existing = await pool.query(
    `SELECT source_valuation_id, status, partition, is_anchor, notes
     FROM gold_standard_cases WHERE organization_id = $1 AND case_code = $2`,
    [organizationId, gold.caseCode],
  );
  const row = existing.rows[0] as
    | { source_valuation_id: string; status: string; partition: string; is_anchor: boolean; notes: string | null }
    | undefined;
  if (row !== undefined) {
    if (
      row.source_valuation_id !== valuation.id ||
      row.status !== "VALIDATED" ||
      row.partition !== gold.partition ||
      row.is_anchor !== gold.isAnchor ||
      row.notes !== SYNTHETIC_DEMO_MARKER
    ) {
      throw new PersistenceError("DEMO_GOLD_COLLISION", `Gold Standard case ${gold.caseCode} was modified or collides.`);
    }
    return;
  }
  await service.captureApprovedValuation(organizationId, valuation.id, {
    caseCode: gold.caseCode,
    anonymizedLabel: gold.anonymizedLabel,
    partition: gold.partition,
    isAnchor: gold.isAnchor,
    notes: SYNTHETIC_DEMO_MARKER,
  });
}
