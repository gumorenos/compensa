import type { Pool, PoolClient } from "pg";
import {
  compareAgainstGoldStandard,
  type GoldStandardComparisonResult,
  type GoldStandardPartition,
} from "../domain/gold-standard.js";
import { evaluateValuation } from "../domain/scoring-engine.js";
import type { ValuationSelections } from "../domain/methodology.js";
import { CompensaRepository, PersistenceError, type Job, type Valuation } from "../persistence/database.js";
import { GoldStandardRepository, type GoldStandardCase, type GoldStandardCaseBundle } from "../persistence/gold-standard.js";
import { parseGoldStandardImport, type GoldStandardImportDocument } from "./gold-standard-import.js";

export interface CaptureApprovedValuationInput {
  caseCode: string;
  anonymizedLabel: string;
  partition?: GoldStandardPartition;
  isAnchor?: boolean;
  expertUserId?: string | null;
  createdByUserId?: string | null;
  notes?: string | null;
}

export interface GoldStandardImportResult { imported: GoldStandardCaseBundle[]; }

export class GoldStandardService {
  private readonly core: CompensaRepository;
  private readonly gold: GoldStandardRepository;

  constructor(pool: Pool) { this.core = new CompensaRepository(pool); this.gold = new GoldStandardRepository(pool); }

  async captureApprovedValuation(organizationId: string, valuationId: string, input: CaptureApprovedValuationInput): Promise<GoldStandardCaseBundle> {
    return this.gold.transaction((client) => this.captureApprovedValuationWithClient(organizationId, valuationId, input, client));
  }

  async importApprovedValuations(organizationId: string, document: unknown, createdByUserId?: string | null): Promise<GoldStandardImportResult> {
    const parsed: GoldStandardImportDocument = parseGoldStandardImport(document);
    return this.gold.transaction(async (client) => {
      const imported: GoldStandardCaseBundle[] = [];
      for (const row of parsed.cases) {
        imported.push(await this.captureApprovedValuationWithClient(organizationId, row.valuationId, {
          caseCode: row.caseCode,
          anonymizedLabel: row.anonymizedLabel,
          partition: row.partition,
          isAnchor: row.isAnchor,
          expertUserId: row.expertUserId,
          createdByUserId: createdByUserId ?? null,
          notes: row.notes,
        }, client));
      }
      return { imported };
    });
  }

  private async captureApprovedValuationWithClient(organizationId: string, valuationId: string, input: CaptureApprovedValuationInput, client: PoolClient): Promise<GoldStandardCaseBundle> {
    await lockCapture(client, valuationId);
    const existing = await this.gold.getCaseBySourceValuation(organizationId, valuationId, client);
    if (existing !== null) throw new PersistenceError("GOLD_CASE_ALREADY_CAPTURED", `Valuation ${valuationId} is already represented by Gold Standard case ${existing.caseCode}.`);

    const valuation = await this.core.getValuation(organizationId, valuationId, client);
    requireApprovedValuation(valuation);
    const job = await this.core.getJob(organizationId, valuation.jobId, client);
    const methodology = await this.core.getMethodologyVersionForOrganization(organizationId, valuation.methodologyVersionId, client);
    const decisions = await this.core.listValuationDecisions(organizationId, valuation.id, client);
    const evidence = await this.core.listValuationEvidence(organizationId, valuation.id, client);
    if (job === null) throw new PersistenceError("JOB_NOT_FOUND", "Approved valuation references no available job.");
    if (methodology === null) throw new PersistenceError("METHODOLOGY_NOT_FOUND", "Approved valuation references no methodology available to this organization.");

    const description = valuation.jobDescriptionVersionId === null ? null : await this.core.getJobDescriptionVersion(organizationId, valuation.jobDescriptionVersionId, client);
    if (valuation.jobDescriptionVersionId !== null && description === null) throw new PersistenceError("DESCRIPTION_NOT_FOUND", "Approved valuation references a missing job-description version.");

    const selections: ValuationSelections = Object.fromEntries(decisions.map((decision) => [decision.dimensionCode, decision.selectedLevelCode]));
    const scoring = evaluateValuation(methodology.definition, selections);
    if (scoring.status !== "SUCCESS" || scoring.points === null || scoring.grade === null) {
      throw new PersistenceError("GOLD_REFERENCE_NOT_REPRODUCIBLE", `Approved valuation cannot be reproduced: ${scoring.errors.map((error) => `${error.code}: ${error.message}`).join("; ")}`);
    }
    if (valuation.totalPoints === null || !numbersEqual(valuation.totalPoints, scoring.points) || valuation.gradeCode !== scoring.grade.code) {
      throw new PersistenceError("GOLD_REFERENCE_RESULT_MISMATCH", `Approved valuation stores ${valuation.totalPoints ?? "null"}/${valuation.gradeCode ?? "null"} but recalculates to ${scoring.points}/${scoring.grade.code}.`);
    }

    const draftCase = await this.gold.createCase({ organizationId, caseCode: input.caseCode, anonymizedLabel: input.anonymizedLabel, sourceType: "APPROVED_VALUATION", sourceValuationId: valuation.id, methodologyVersionId: methodology.id, jobDescriptionVersionId: description?.id ?? null, status: "DRAFT", partition: input.partition ?? "UNASSIGNED", isAnchor: input.isAnchor ?? false, jobSnapshot: snapshotJob(job), methodologySnapshot: methodology.definition, descriptionSnapshot: description?.content ?? null, expertUserId: input.expertUserId ?? null, createdByUserId: input.createdByUserId ?? null, notes: input.notes ?? null }, client);

    const decisionIdMap = new Map<string, string>();
    for (const decision of decisions) {
      const copied = await this.gold.createDecision({ organizationId, caseId: draftCase.id, dimensionCode: decision.dimensionCode, selectedLevelCode: decision.selectedLevelCode, justification: decision.justification }, client);
      decisionIdMap.set(decision.id, copied.id);
    }
    for (const item of evidence) {
      const goldDecisionId = decisionIdMap.get(item.decisionId);
      if (goldDecisionId === undefined) throw new PersistenceError("GOLD_EVIDENCE_DECISION_MISSING", `Evidence ${item.id} references a decision that was not copied into the Gold Standard case.`);
      await this.gold.createEvidence({ organizationId, caseId: draftCase.id, decisionId: goldDecisionId, sourceType: item.sourceType, sourceSection: item.sourceSection, excerpt: item.excerpt }, client);
    }
    await this.gold.validateCase(organizationId, draftCase.id, scoring.points, scoring.grade.code, client);
    const bundle = await this.gold.getCaseBundle(organizationId, draftCase.id, client);
    if (bundle === null) throw new PersistenceError("DATABASE_INVARIANT", "Gold Standard case disappeared during its creation transaction.");
    return bundle;
  }

  async getCase(organizationId: string, caseId: string): Promise<GoldStandardCaseBundle | null> { return this.gold.getCaseBundle(organizationId, caseId); }
  async listCases(organizationId: string): Promise<GoldStandardCase[]> { return this.gold.listCases(organizationId); }

  async assignPartition(organizationId: string, caseId: string, partition: GoldStandardPartition): Promise<GoldStandardCase> {
    const goldCase = await this.gold.getCase(organizationId, caseId);
    if (goldCase === null) throw new PersistenceError("GOLD_CASE_NOT_FOUND", "Gold Standard case was not found.");
    if (goldCase.status !== "VALIDATED") throw new PersistenceError("GOLD_CASE_NOT_VALIDATED", "Only validated Gold Standard cases can be assigned to calibration or holdout partitions.");
    return this.gold.updatePartition(organizationId, caseId, partition);
  }

  async compareCase(organizationId: string, caseId: string, candidateSelections: ValuationSelections): Promise<GoldStandardComparisonResult> {
    const bundle = await this.gold.getCaseBundle(organizationId, caseId);
    if (bundle === null) throw new PersistenceError("GOLD_CASE_NOT_FOUND", "Gold Standard case was not found.");
    if (bundle.case.status !== "VALIDATED" || bundle.case.expectedTotalPoints === null || bundle.case.expectedGradeCode === null) throw new PersistenceError("GOLD_CASE_NOT_VALIDATED", "Only validated Gold Standard cases can be used for comparisons.");
    const referenceSelections: ValuationSelections = Object.fromEntries(bundle.decisions.map((decision) => [decision.dimensionCode, decision.selectedLevelCode]));
    return compareAgainstGoldStandard({ methodology: bundle.case.methodologySnapshot, selections: referenceSelections, expectedPoints: bundle.case.expectedTotalPoints, expectedGradeCode: bundle.case.expectedGradeCode }, candidateSelections);
  }
}

function requireApprovedValuation(valuation: Valuation | null): asserts valuation is Valuation & { totalPoints: number; gradeCode: string } {
  if (valuation === null) throw new PersistenceError("VALUATION_NOT_FOUND", "Valuation does not exist in this organization.");
  if (valuation.status !== "APPROVED") throw new PersistenceError("GOLD_SOURCE_NOT_APPROVED", `Gold Standard capture requires APPROVED status; received ${valuation.status}.`);
  if (valuation.totalPoints === null || valuation.gradeCode === null) throw new PersistenceError("GOLD_SOURCE_INCOMPLETE", "Approved valuation has no final points or grade.");
}
function snapshotJob(job: Job) { return { code: job.code, name: job.name, department: job.department, area: job.area, jobFamily: job.jobFamily }; }
async function lockCapture(client: PoolClient, valuationId: string): Promise<void> { await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`gold-standard-capture:${valuationId}`]); }
function numbersEqual(left: number, right: number): boolean { return Math.abs(left - right) <= 1e-9; }
