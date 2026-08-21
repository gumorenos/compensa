import { evaluateValuation, type ScoringResult } from "../domain/scoring-engine.js";
import type { MethodologyDefinition, ValuationSelections } from "../domain/methodology.js";
import {
  CompensaRepository,
  PersistenceError,
  type UpsertDecisionInput,
  type Valuation,
  type ValuationDecision,
} from "../persistence/database.js";

export interface ValuationSnapshot {
  valuation: Valuation;
  decisions: ValuationDecision[];
  complete: boolean;
  scoring: ScoringResult | null;
}

export class ValuationService {
  constructor(private readonly repository: CompensaRepository) {}

  async startValuation(
    organizationId: string,
    jobId: string,
    methodologyVersionId: string,
  ): Promise<Valuation> {
    return this.repository.startValuation(organizationId, jobId, methodologyVersionId);
  }

  async saveDecision(
    organizationId: string,
    valuationId: string,
    input: UpsertDecisionInput,
  ): Promise<ValuationSnapshot> {
    return this.repository.transaction(async (client) => {
      const valuation = await this.repository.getValuation(organizationId, valuationId, client);
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
