import { evaluateValuation, type ScoringResult } from "../domain/scoring-engine.js";
import type { MethodologyDefinition, ValuationSelections } from "../domain/methodology.js";
import {
  CompensaRepository,
  PersistenceError,
  type CreateEvidenceInput,
  type EvidenceSourceType,
  type UpsertDecisionInput,
  type Valuation,
  type ValuationDecision,
  type ValuationEvidence,
} from "../persistence/database.js";

export interface ValuationSnapshot {
  valuation: Valuation;
  decisions: ValuationDecision[];
  complete: boolean;
  scoring: ScoringResult | null;
}

export interface SaveDecisionSupportInput {
  dimensionCode: string;
  justification: string | null;
  evidence?: {
    sourceType: EvidenceSourceType;
    sourceSection?: string | null;
    excerpt: string;
  };
}

export interface DecisionSupportResult {
  decision: ValuationDecision;
  evidence: ValuationEvidence | null;
}

export class ValuationService {
  constructor(private readonly repository: CompensaRepository) {}

  async startValuation(
    organizationId: string,
    jobId: string,
    methodologyVersionId: string,
  ): Promise<Valuation> {
    const methodology = await this.repository.getMethodologyVersionForOrganization(
      organizationId,
      methodologyVersionId,
    );
    if (methodology === null) {
      throw new PersistenceError(
        "METHODOLOGY_NOT_FOUND",
        "Methodology version is not available to this organization.",
      );
    }
    if (methodology.status !== "ACTIVE") {
      throw new PersistenceError(
        "METHODOLOGY_NOT_ACTIVE",
        `Methodology version ${methodology.code} ${methodology.version} is not active.`,
      );
    }

    return this.repository.startValuation(organizationId, jobId, methodologyVersionId);
  }

  async saveDecision(
    organizationId: string,
    valuationId: string,
    input: UpsertDecisionInput,
  ): Promise<ValuationSnapshot> {
    return this.repository.transaction(async (client) => {
      await lockValuation(client, valuationId);

      const valuation = await this.repository.getValuation(organizationId, valuationId, client);
      requireEditableValuation(valuation);

      const methodologyVersion = await this.repository.getMethodologyVersionForOrganization(
        organizationId,
        valuation.methodologyVersionId,
        client,
      );
      if (methodologyVersion === null) {
        throw new PersistenceError(
          "METHODOLOGY_NOT_FOUND",
          "The valuation methodology version is no longer available to this organization.",
        );
      }

      validateDecision(methodologyVersion.definition, input.dimensionCode, input.selectedLevelCode);

      await this.repository.upsertValuationDecision(
        organizationId,
        valuationId,
        input,
        client,
      );
      await this.repository.appendValuationEvent(
        organizationId,
        valuationId,
        "DECISION_SAVED",
        {
          dimensionCode: input.dimensionCode,
          selectedLevelCode: input.selectedLevelCode,
          source: input.source ?? "MANUAL",
        },
        client,
      );

      const decisions = await this.repository.listValuationDecisions(
        organizationId,
        valuationId,
        client,
      );
      const selections: ValuationSelections = Object.fromEntries(
        decisions.map((decision) => [decision.dimensionCode, decision.selectedLevelCode]),
      );
      const scoring = evaluateValuation(methodologyVersion.definition, selections);

      if (scoring.status === "SUCCESS" && scoring.points !== null && scoring.grade !== null) {
        const updated = await this.repository.updateValuationResult(
          organizationId,
          valuationId,
          scoring.points,
          scoring.grade.code,
          client,
        );
        await this.repository.appendValuationEvent(
          organizationId,
          valuationId,
          "VALUATION_RECALCULATED",
          { points: scoring.points, gradeCode: scoring.grade.code },
          client,
        );
        return { valuation: updated, decisions, complete: true, scoring };
      }

      const onlyMissingSelections =
        scoring.errors.length > 0 &&
        scoring.errors.every((error) => error.code === "MISSING_REQUIRED_SELECTION");

      if (onlyMissingSelections) {
        const updated = await this.repository.updateValuationResult(
          organizationId,
          valuationId,
          null,
          null,
          client,
        );
        return { valuation: updated, decisions, complete: false, scoring: null };
      }

      throw new PersistenceError(
        "SCORING_FAILED",
        scoring.errors.map((error) => `${error.code}: ${error.message}`).join("; "),
      );
    });
  }

  async saveDecisionSupport(
    organizationId: string,
    valuationId: string,
    input: SaveDecisionSupportInput,
  ): Promise<DecisionSupportResult> {
    return this.repository.transaction(async (client) => {
      await lockValuation(client, valuationId);

      const valuation = await this.repository.getValuation(organizationId, valuationId, client);
      requireEditableValuation(valuation);

      const decisions = await this.repository.listValuationDecisions(
        organizationId,
        valuationId,
        client,
      );
      const existing = decisions.find((decision) => decision.dimensionCode === input.dimensionCode);
      if (existing === undefined) {
        throw new PersistenceError(
          "DECISION_NOT_FOUND",
          `Select a level for dimension ${input.dimensionCode} before adding support.`,
        );
      }

      const justification = normalizeOptionalText(input.justification);
      const decision = await this.repository.updateValuationDecisionJustification(
        organizationId,
        valuationId,
        input.dimensionCode,
        justification,
        client,
      );

      let evidence: ValuationEvidence | null = null;
      if (input.evidence !== undefined) {
        const excerpt = input.evidence.excerpt.trim();
        if (excerpt === "") {
          throw new PersistenceError("EVIDENCE_EMPTY", "Evidence excerpt cannot be empty.");
        }

        const evidenceInput: CreateEvidenceInput = {
          sourceType: input.evidence.sourceType,
          sourceSection: normalizeOptionalText(input.evidence.sourceSection ?? null),
          excerpt,
        };

        if (input.evidence.sourceType === "JOB_DESCRIPTION") {
          if (valuation.jobDescriptionVersionId === null) {
            throw new PersistenceError(
              "DESCRIPTION_NOT_PINNED",
              "This valuation was started without a job description version.",
            );
          }
          const description = await this.repository.getJobDescriptionVersion(
            organizationId,
            valuation.jobDescriptionVersionId,
            client,
          );
          if (description === null) {
            throw new PersistenceError(
              "DESCRIPTION_NOT_FOUND",
              "The job description attached to this valuation no longer exists.",
            );
          }
          if (!containsEvidence(description.content, excerpt)) {
            throw new PersistenceError(
              "EVIDENCE_NOT_IN_DESCRIPTION",
              "Job-description evidence must be a passage contained in the pinned description.",
            );
          }
          evidenceInput.jobDescriptionVersionId = description.id;
        }

        evidence = await this.repository.addValuationEvidence(
          organizationId,
          valuationId,
          decision.id,
          evidenceInput,
          client,
        );
      }

      await this.repository.appendValuationEvent(
        organizationId,
        valuationId,
        "DECISION_SUPPORT_SAVED",
        {
          dimensionCode: input.dimensionCode,
          justificationPresent: justification !== null,
          evidenceAdded: evidence !== null,
          evidenceSourceType: evidence?.sourceType ?? null,
        },
        client,
      );

      return { decision, evidence };
    });
  }

  async deleteEvidence(
    organizationId: string,
    valuationId: string,
    evidenceId: string,
  ): Promise<void> {
    await this.repository.transaction(async (client) => {
      await lockValuation(client, valuationId);
      const valuation = await this.repository.getValuation(organizationId, valuationId, client);
      requireEditableValuation(valuation);
      await this.repository.deleteValuationEvidence(
        organizationId,
        valuationId,
        evidenceId,
        client,
      );
      await this.repository.appendValuationEvent(
        organizationId,
        valuationId,
        "EVIDENCE_REMOVED",
        { evidenceId },
        client,
      );
    });
  }

  async submitForReview(
    organizationId: string,
    valuationId: string,
    comment?: string | null,
  ): Promise<Valuation> {
    return this.repository.transaction(async (client) => {
      await lockValuation(client, valuationId);
      const valuation = await this.repository.getValuation(organizationId, valuationId, client);
      if (valuation === null) {
        throw new PersistenceError(
          "VALUATION_NOT_FOUND",
          "Valuation does not exist in this organization.",
        );
      }
      if (valuation.status !== "DRAFT" && valuation.status !== "RETURNED") {
        throw new PersistenceError(
          "INVALID_REVIEW_TRANSITION",
          `Valuation in status ${valuation.status} cannot be submitted for review.`,
        );
      }

      await this.assertReadyForReview(organizationId, valuation, client);
      const normalizedComment = normalizeOptionalText(comment ?? null);
      const updated = await this.repository.updateValuationStatus(
        organizationId,
        valuationId,
        "IN_REVIEW",
        client,
      );
      await this.repository.appendReviewAction(
        organizationId,
        valuationId,
        "SUBMITTED",
        normalizedComment,
        client,
      );
      await this.repository.appendValuationEvent(
        organizationId,
        valuationId,
        "VALUATION_SUBMITTED",
        { comment: normalizedComment },
        client,
      );
      return updated;
    });
  }

  async returnForChanges(
    organizationId: string,
    valuationId: string,
    comment: string,
  ): Promise<Valuation> {
    const normalizedComment = normalizeOptionalText(comment);
    if (normalizedComment === null) {
      throw new PersistenceError("RETURN_COMMENT_REQUIRED", "A return comment is required.");
    }

    return this.repository.transaction(async (client) => {
      await lockValuation(client, valuationId);
      const valuation = await this.repository.getValuation(organizationId, valuationId, client);
      if (valuation === null) {
        throw new PersistenceError(
          "VALUATION_NOT_FOUND",
          "Valuation does not exist in this organization.",
        );
      }
      if (valuation.status !== "IN_REVIEW") {
        throw new PersistenceError(
          "INVALID_REVIEW_TRANSITION",
          `Valuation in status ${valuation.status} cannot be returned.`,
        );
      }

      const updated = await this.repository.updateValuationStatus(
        organizationId,
        valuationId,
        "RETURNED",
        client,
      );
      await this.repository.appendReviewAction(
        organizationId,
        valuationId,
        "RETURNED",
        normalizedComment,
        client,
      );
      await this.repository.appendValuationEvent(
        organizationId,
        valuationId,
        "VALUATION_RETURNED",
        { comment: normalizedComment },
        client,
      );
      return updated;
    });
  }

  async approve(
    organizationId: string,
    valuationId: string,
    comment?: string | null,
  ): Promise<Valuation> {
    return this.repository.transaction(async (client) => {
      await lockValuation(client, valuationId);
      const valuation = await this.repository.getValuation(organizationId, valuationId, client);
      if (valuation === null) {
        throw new PersistenceError(
          "VALUATION_NOT_FOUND",
          "Valuation does not exist in this organization.",
        );
      }
      if (valuation.status !== "IN_REVIEW") {
        throw new PersistenceError(
          "INVALID_REVIEW_TRANSITION",
          `Valuation in status ${valuation.status} cannot be approved.`,
        );
      }

      await this.assertReadyForReview(organizationId, valuation, client);
      const normalizedComment = normalizeOptionalText(comment ?? null);
      const updated = await this.repository.updateValuationStatus(
        organizationId,
        valuationId,
        "APPROVED",
        client,
      );
      await this.repository.appendReviewAction(
        organizationId,
        valuationId,
        "APPROVED",
        normalizedComment,
        client,
      );
      await this.repository.appendValuationEvent(
        organizationId,
        valuationId,
        "VALUATION_APPROVED",
        { comment: normalizedComment },
        client,
      );
      return updated;
    });
  }

  async getSnapshot(organizationId: string, valuationId: string): Promise<ValuationSnapshot | null> {
    const valuation = await this.repository.getValuation(organizationId, valuationId);
    if (valuation === null) return null;
    const decisions = await this.repository.listValuationDecisions(organizationId, valuationId);
    return {
      valuation,
      decisions,
      complete: valuation.totalPoints !== null && valuation.gradeCode !== null,
      scoring: null,
    };
  }

  private async assertReadyForReview(
    organizationId: string,
    valuation: Valuation,
    db: Parameters<CompensaRepository["getValuation"]>[2],
  ): Promise<void> {
    if (valuation.totalPoints === null || valuation.gradeCode === null) {
      throw new PersistenceError(
        "VALUATION_INCOMPLETE",
        "Complete all required dimensions before sending the valuation to review.",
      );
    }

    const methodology = await this.repository.getMethodologyVersionForOrganization(
      organizationId,
      valuation.methodologyVersionId,
      db,
    );
    if (methodology === null) {
      throw new PersistenceError(
        "METHODOLOGY_NOT_FOUND",
        "The valuation methodology version is no longer available to this organization.",
      );
    }

    const decisions = await this.repository.listValuationDecisions(
      organizationId,
      valuation.id,
      db,
    );
    const byDimension = new Map(decisions.map((decision) => [decision.dimensionCode, decision]));
    const missingJustification = methodology.definition.factors
      .flatMap((factor) => factor.dimensions)
      .filter((dimension) => dimension.required)
      .filter((dimension) => {
        const decision = byDimension.get(dimension.code);
        return decision === undefined || normalizeOptionalText(decision.justification) === null;
      })
      .map((dimension) => dimension.name);

    if (missingJustification.length > 0) {
      throw new PersistenceError(
        "JUSTIFICATION_REQUIRED",
        `Add justification to every required dimension before review: ${missingJustification.join(", ")}.`,
      );
    }
  }
}

function validateDecision(
  methodology: MethodologyDefinition,
  dimensionCode: string,
  selectedLevelCode: string,
): void {
  const dimension = methodology.factors
    .flatMap((factor) => factor.dimensions)
    .find((candidate) => candidate.code === dimensionCode);

  if (dimension === undefined) {
    throw new PersistenceError(
      "UNKNOWN_DIMENSION",
      `Dimension ${dimensionCode} is not part of methodology ${methodology.code} ${methodology.version}.`,
    );
  }

  if (!dimension.levels.some((level) => level.code === selectedLevelCode)) {
    throw new PersistenceError(
      "INVALID_LEVEL",
      `Level ${selectedLevelCode} does not belong to dimension ${dimensionCode}.`,
    );
  }
}

function requireEditableValuation(valuation: Valuation | null): asserts valuation is Valuation {
  if (valuation === null) {
    throw new PersistenceError(
      "VALUATION_NOT_FOUND",
      "Valuation does not exist in this organization.",
    );
  }
  if (valuation.status !== "DRAFT" && valuation.status !== "RETURNED") {
    throw new PersistenceError(
      "VALUATION_NOT_EDITABLE",
      `Valuation in status ${valuation.status} cannot be edited.`,
    );
  }
}

async function lockValuation(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  valuationId: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `valuation-edit:${valuationId}`,
  ]);
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function containsEvidence(description: string, excerpt: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
  return normalize(description).includes(normalize(excerpt));
}
