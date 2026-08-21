import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ValuationService } from "../../src/application/valuation-service.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";
import {
  demoMethodology,
  demoMidLevelSelections,
} from "../../src/fixtures/demo-methodology.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for review workflow integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const service = new ValuationService(repository);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, organizations RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

async function createBase(slug: string) {
  const organization = await repository.createOrganization({
    slug,
    name: `${slug} Corp`,
    countryCode: "PE",
    currencyCode: "PEN",
  });
  const job = await repository.createJob(organization.id, {
    code: `${slug.toUpperCase()}-001`,
    name: "Jefe de Planeamiento",
    department: "Finanzas",
  });
  const methodology = await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa demo",
    status: "ACTIVE",
  });
  return { organization, job, methodology };
}

async function completeValuationWithJustifications(
  organizationId: string,
  valuationId: string,
): Promise<void> {
  for (const [dimensionCode, selectedLevelCode] of Object.entries(demoMidLevelSelections)) {
    await service.saveDecision(organizationId, valuationId, {
      dimensionCode,
      selectedLevelCode,
    });
    await service.saveDecisionSupport(organizationId, valuationId, {
      dimensionCode,
      justification: `Justificación experta para ${dimensionCode}.`,
    });
  }
}

describe("job descriptions, evidence and review workflow", () => {
  it("versions descriptions concurrently and pins the latest version when valuation starts", async () => {
    const { organization, job, methodology } = await createBase("description-pinning");

    const [first, second] = await Promise.all([
      repository.createJobDescriptionVersion(organization.id, job.id, {
        content: "Versión inicial. El puesto analiza presupuesto y reporta a Finanzas.",
        sourceLabel: "Carga A",
      }),
      repository.createJobDescriptionVersion(organization.id, job.id, {
        content: "Versión revisada. El puesto coordina presupuesto y escenarios financieros.",
        sourceLabel: "Carga B",
      }),
    ]);

    expect([first.version, second.version].sort((left, right) => left - right)).toEqual([1, 2]);
    const latest = await repository.getLatestJobDescription(organization.id, job.id);
    expect(latest?.version).toBe(2);

    const valuation = await service.startValuation(organization.id, job.id, methodology.id);
    expect(valuation.jobDescriptionVersionId).toBe(latest?.id);

    const third = await repository.createJobDescriptionVersion(organization.id, job.id, {
      content: "Versión posterior creada después de iniciar la valoración.",
    });
    expect(third.version).toBe(3);

    const reloaded = await repository.getValuation(organization.id, valuation.id);
    expect(reloaded?.jobDescriptionVersionId).toBe(latest?.id);
    expect(reloaded?.jobDescriptionVersionId).not.toBe(third.id);
  });

  it("stores auditable evidence and rejects invented job-description excerpts", async () => {
    const { organization, job, methodology } = await createBase("evidence");
    const description = await repository.createJobDescriptionVersion(organization.id, job.id, {
      content:
        "Propósito: asegurar el planeamiento financiero. Responsabilidades: Puede aprobar ajustes operativos dentro de políticas definidas y coordina el presupuesto anual.",
      sourceLabel: "Descriptivo validado",
    });
    const valuation = await service.startValuation(organization.id, job.id, methodology.id);
    expect(valuation.jobDescriptionVersionId).toBe(description.id);

    await service.saveDecision(organization.id, valuation.id, {
      dimensionCode: "AUTONOMY",
      selectedLevelCode: "A2",
    });
    await service.saveDecisionSupport(organization.id, valuation.id, {
      dimensionCode: "AUTONOMY",
      justification: "Decide dentro de políticas y límites definidos.",
      evidence: {
        sourceType: "JOB_DESCRIPTION",
        sourceSection: "Responsabilidades",
        excerpt: "Puede aprobar ajustes operativos dentro de políticas definidas",
      },
    });

    const evidence = await repository.listValuationEvidence(organization.id, valuation.id);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.jobDescriptionVersionId).toBe(description.id);
    expect(evidence[0]?.sourceType).toBe("JOB_DESCRIPTION");

    await service.saveDecision(organization.id, valuation.id, {
      dimensionCode: "AUTONOMY",
      selectedLevelCode: "A1",
    });
    const decisions = await repository.listValuationDecisions(organization.id, valuation.id);
    expect(decisions.find((decision) => decision.dimensionCode === "AUTONOMY")?.justification)
      .toBe("Decide dentro de políticas y límites definidos.");

    await expect(
      service.saveDecisionSupport(organization.id, valuation.id, {
        dimensionCode: "AUTONOMY",
        justification: "Se mantiene la justificación.",
        evidence: {
          sourceType: "JOB_DESCRIPTION",
          excerpt: "Administra un presupuesto de cien millones de dólares",
        },
      }),
    ).rejects.toMatchObject({ code: "EVIDENCE_NOT_IN_DESCRIPTION" });

    expect(await repository.listValuationEvidence(organization.id, valuation.id)).toHaveLength(1);
  });

  it("enforces review readiness, return, resubmission and approval immutability", async () => {
    const { organization, job, methodology } = await createBase("review");
    const valuation = await service.startValuation(organization.id, job.id, methodology.id);

    for (const [dimensionCode, selectedLevelCode] of Object.entries(demoMidLevelSelections)) {
      await service.saveDecision(organization.id, valuation.id, {
        dimensionCode,
        selectedLevelCode,
      });
    }

    await expect(
      service.submitForReview(organization.id, valuation.id),
    ).rejects.toMatchObject({ code: "JUSTIFICATION_REQUIRED" });

    for (const dimensionCode of Object.keys(demoMidLevelSelections)) {
      await service.saveDecisionSupport(organization.id, valuation.id, {
        dimensionCode,
        justification: `Fundamento para ${dimensionCode}.`,
      });
    }

    const submitted = await service.submitForReview(
      organization.id,
      valuation.id,
      "Lista para calibración.",
    );
    expect(submitted.status).toBe("IN_REVIEW");

    await expect(
      service.saveDecision(organization.id, valuation.id, {
        dimensionCode: "AUTONOMY",
        selectedLevelCode: "A1",
      }),
    ).rejects.toMatchObject({ code: "VALUATION_NOT_EDITABLE" });

    await expect(
      service.returnForChanges(organization.id, valuation.id, "   "),
    ).rejects.toMatchObject({ code: "RETURN_COMMENT_REQUIRED" });

    const returned = await service.returnForChanges(
      organization.id,
      valuation.id,
      "Revisar el nivel de autonomía con el jefe del puesto.",
    );
    expect(returned.status).toBe("RETURNED");

    await service.saveDecision(organization.id, valuation.id, {
      dimensionCode: "AUTONOMY",
      selectedLevelCode: "A1",
    });
    const resubmitted = await service.submitForReview(organization.id, valuation.id);
    expect(resubmitted.status).toBe("IN_REVIEW");

    const approved = await service.approve(
      organization.id,
      valuation.id,
      "Aprobada en comité.",
    );
    expect(approved.status).toBe("APPROVED");

    await expect(
      service.saveDecisionSupport(organization.id, valuation.id, {
        dimensionCode: "AUTONOMY",
        justification: "Intento posterior a aprobación.",
      }),
    ).rejects.toMatchObject({ code: "VALUATION_NOT_EDITABLE" });

    const history = await repository.listReviewActions(organization.id, valuation.id);
    expect(history.map((item) => item.action)).toEqual([
      "SUBMITTED",
      "RETURNED",
      "SUBMITTED",
      "APPROVED",
    ]);
  });

  it("rejects submission while required dimensions are incomplete", async () => {
    const { organization, job, methodology } = await createBase("incomplete-review");
    const valuation = await service.startValuation(organization.id, job.id, methodology.id);
    await service.saveDecision(organization.id, valuation.id, {
      dimensionCode: "DOMAIN_KNOWLEDGE",
      selectedLevelCode: "K2",
    });
    await service.saveDecisionSupport(organization.id, valuation.id, {
      dimensionCode: "DOMAIN_KNOWLEDGE",
      justification: "Conocimiento funcional intermedio.",
    });

    await expect(
      service.submitForReview(organization.id, valuation.id),
    ).rejects.toMatchObject({ code: "VALUATION_INCOMPLETE" });
  });
});
