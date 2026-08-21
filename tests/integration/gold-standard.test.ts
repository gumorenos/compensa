import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoldStandardService } from "../../src/application/gold-standard-service.js";
import { ValuationService } from "../../src/application/valuation-service.js";
import {
  demoMethodology,
  demoMidLevelSelections,
} from "../../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for Gold Standard integration tests.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);
const goldService = new GoldStandardService(pool);

beforeAll(async () => {
  await runMigrations(pool);
});

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await pool.end();
});

async function cleanDatabase(): Promise<void> {
  await pool.query(
    `TRUNCATE gold_standard_evidence, gold_standard_decisions, gold_standard_cases,
      security_audit_events, organization_memberships,
      valuation_review_actions, valuation_decision_evidence,
      valuation_events, valuation_decisions, valuations, job_description_versions,
      methodology_versions, jobs, auth_sessions, auth_accounts, auth_verifications,
      auth_users, organizations RESTART IDENTITY CASCADE`,
  );
}

async function createApprovedSource(slug: string) {
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
    area: "Planeamiento",
    jobFamily: "Finanzas",
  });
  const methodology = await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa demo",
    status: "ACTIVE",
  });
  const description = await repository.createJobDescriptionVersion(organization.id, job.id, {
    content:
      "Propósito: asegurar el planeamiento financiero. Responsabilidades: Puede aprobar ajustes operativos dentro de políticas definidas y coordina el presupuesto anual.",
    sourceLabel: "Descriptivo experto v1",
  });
  const valuation = await valuationService.startValuation(
    organization.id,
    job.id,
    methodology.id,
  );
  expect(valuation.jobDescriptionVersionId).toBe(description.id);

  for (const [dimensionCode, selectedLevelCode] of Object.entries(demoMidLevelSelections)) {
    await valuationService.saveDecision(organization.id, valuation.id, {
      dimensionCode,
      selectedLevelCode,
    });

    if (dimensionCode === "AUTONOMY") {
      await valuationService.saveDecisionSupport(organization.id, valuation.id, {
        dimensionCode,
        justification: "Decide dentro de políticas y límites definidos.",
        evidence: {
          sourceType: "JOB_DESCRIPTION",
          sourceSection: "Responsabilidades",
          excerpt: "Puede aprobar ajustes operativos dentro de políticas definidas",
        },
      });
    } else {
      await valuationService.saveDecisionSupport(organization.id, valuation.id, {
        dimensionCode,
        justification: `Juicio experto para ${dimensionCode}.`,
      });
    }
  }

  await valuationService.submitForReview(
    organization.id,
    valuation.id,
    "Referencia revisada por especialista.",
  );
  const approved = await valuationService.approve(
    organization.id,
    valuation.id,
    "Aprobada como referencia experta.",
  );
  expect(approved.status).toBe("APPROVED");
  expect(approved.totalPoints).toBe(231);
  expect(approved.gradeCode).toBe("G3");

  return { organization, job, methodology, description, valuation: approved };
}

describe("Gold Standard persistence", () => {
  it("captures an approved valuation with immutable snapshots, decisions and evidence", async () => {
    const source = await createApprovedSource("gold-capture");

    const captured = await goldService.captureApprovedValuation(
      source.organization.id,
      source.valuation.id,
      {
        caseCode: "GS-001",
        anonymizedLabel: "Puesto referencia 001",
        partition: "CALIBRATION",
        isAnchor: true,
        notes: "Caso anonimizado para calibración inicial.",
      },
    );

    expect(captured.case).toMatchObject({
      organizationId: source.organization.id,
      caseCode: "GS-001",
      anonymizedLabel: "Puesto referencia 001",
      sourceType: "APPROVED_VALUATION",
      sourceValuationId: source.valuation.id,
      methodologyVersionId: source.methodology.id,
      jobDescriptionVersionId: source.description.id,
      status: "VALIDATED",
      partition: "CALIBRATION",
      isAnchor: true,
      expectedTotalPoints: 231,
      expectedGradeCode: "G3",
    });
    expect(captured.case.jobSnapshot).toEqual({
      code: source.job.code,
      name: "Jefe de Planeamiento",
      department: "Finanzas",
      area: "Planeamiento",
      jobFamily: "Finanzas",
    });
    expect(captured.case.methodologySnapshot).toEqual(demoMethodology);
    expect(captured.case.descriptionSnapshot).toBe(source.description.content);
    expect(captured.decisions).toHaveLength(6);
    expect(captured.decisions.find((item) => item.dimensionCode === "AUTONOMY"))
      .toMatchObject({
        selectedLevelCode: "A2",
        justification: "Decide dentro de políticas y límites definidos.",
      });
    expect(captured.evidence).toHaveLength(1);
    expect(captured.evidence[0]).toMatchObject({
      sourceType: "JOB_DESCRIPTION",
      sourceSection: "Responsabilidades",
      excerpt: "Puede aprobar ajustes operativos dentro de políticas definidas",
    });

    const laterDescription = await repository.createJobDescriptionVersion(
      source.organization.id,
      source.job.id,
      {
        content: "Texto posterior que no debe alterar el caso histórico.",
        sourceLabel: "Descriptivo v2",
      },
    );
    expect(laterDescription.version).toBe(2);

    const reloaded = await goldService.getCase(source.organization.id, captured.case.id);
    expect(reloaded?.case.jobDescriptionVersionId).toBe(source.description.id);
    expect(reloaded?.case.descriptionSnapshot).toBe(source.description.content);
    expect(reloaded?.case.descriptionSnapshot).not.toBe(laterDescription.content);

    const comparison = await goldService.compareCase(
      source.organization.id,
      captured.case.id,
      demoMidLevelSelections,
    );
    expect(comparison.status).toBe("SUCCESS");
    if (comparison.status === "SUCCESS") {
      expect(comparison.metrics.dimensionExactAgreementRate).toBe(1);
      expect(comparison.metrics.absolutePointDifference).toBe(0);
      expect(comparison.metrics.gradeMatch).toBe(true);
    }
  });

  it("refuses to promote a non-approved valuation to expert truth", async () => {
    const organization = await repository.createOrganization({
      slug: "gold-draft",
      name: "Gold Draft Corp",
      currencyCode: "PEN",
    });
    const job = await repository.createJob(organization.id, { name: "Analista" });
    const methodology = await repository.createMethodologyVersion({
      organizationId: organization.id,
      definition: demoMethodology,
      contentOwner: "Compensa demo",
      status: "ACTIVE",
    });
    const valuation = await valuationService.startValuation(
      organization.id,
      job.id,
      methodology.id,
    );

    await expect(
      goldService.captureApprovedValuation(organization.id, valuation.id, {
        caseCode: "GS-DRAFT",
        anonymizedLabel: "No debe crearse",
      }),
    ).rejects.toMatchObject({ code: "GOLD_SOURCE_NOT_APPROVED" });

    expect(await goldService.listCases(organization.id)).toEqual([]);
  });

  it("prevents duplicate capture of the same approved valuation", async () => {
    const source = await createApprovedSource("gold-duplicate");

    await goldService.captureApprovedValuation(source.organization.id, source.valuation.id, {
      caseCode: "GS-DUP-1",
      anonymizedLabel: "Primera captura",
    });

    await expect(
      goldService.captureApprovedValuation(source.organization.id, source.valuation.id, {
        caseCode: "GS-DUP-2",
        anonymizedLabel: "Segunda captura",
      }),
    ).rejects.toMatchObject({ code: "GOLD_CASE_ALREADY_CAPTURED" });

    expect(await goldService.listCases(source.organization.id)).toHaveLength(1);
  });

  it("keeps Gold Standard cases isolated between organizations", async () => {
    const source = await createApprovedSource("gold-tenant-a");
    const organizationB = await repository.createOrganization({
      slug: "gold-tenant-b",
      name: "Gold Tenant B",
      currencyCode: "PEN",
    });

    const captured = await goldService.captureApprovedValuation(
      source.organization.id,
      source.valuation.id,
      {
        caseCode: "GS-TENANT",
        anonymizedLabel: "Referencia tenant A",
      },
    );

    expect(await goldService.getCase(organizationB.id, captured.case.id)).toBeNull();
    expect(await goldService.listCases(organizationB.id)).toEqual([]);
    await expect(
      goldService.compareCase(organizationB.id, captured.case.id, demoMidLevelSelections),
    ).rejects.toMatchObject({ code: "GOLD_CASE_NOT_FOUND" });
  });

  it("blocks private methodologies from another tenant at the database boundary", async () => {
    const organizationA = await repository.createOrganization({
      slug: "gold-method-a",
      name: "Gold Method A",
      currencyCode: "PEN",
    });
    const organizationB = await repository.createOrganization({
      slug: "gold-method-b",
      name: "Gold Method B",
      currencyCode: "PEN",
    });
    const methodologyA = await repository.createMethodologyVersion({
      organizationId: organizationA.id,
      definition: demoMethodology,
      contentOwner: "Tenant A only",
      status: "ACTIVE",
    });

    await expect(
      pool.query(
        `INSERT INTO gold_standard_cases (
          organization_id, case_code, anonymized_label, source_type,
          methodology_version_id, status, job_snapshot, methodology_snapshot
        ) VALUES ($1, 'GS-CROSS', 'Cross tenant', 'IMPORT', $2, 'DRAFT', $3::jsonb, $4::jsonb)`,
        [
          organizationB.id,
          methodologyA.id,
          JSON.stringify({ code: null, name: "Puesto", department: null, area: null, jobFamily: null }),
          JSON.stringify(demoMethodology),
        ],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("locks validated reference fields, decisions and evidence in PostgreSQL", async () => {
    const source = await createApprovedSource("gold-immutable");
    const captured = await goldService.captureApprovedValuation(
      source.organization.id,
      source.valuation.id,
      {
        caseCode: "GS-LOCK",
        anonymizedLabel: "Referencia bloqueada",
      },
    );

    await expect(
      pool.query(
        "UPDATE gold_standard_cases SET expected_total_points = 999 WHERE id = $1",
        [captured.case.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const autonomy = captured.decisions.find((item) => item.dimensionCode === "AUTONOMY");
    if (autonomy === undefined) throw new Error("Expected AUTONOMY reference decision.");
    await expect(
      pool.query(
        "UPDATE gold_standard_decisions SET selected_level_code = 'A3' WHERE id = $1",
        [autonomy.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      pool.query("DELETE FROM gold_standard_cases WHERE id = $1", [captured.case.id]),
    ).rejects.toMatchObject({ code: "23514" });

    const reloaded = await goldService.getCase(source.organization.id, captured.case.id);
    expect(reloaded?.case.expectedTotalPoints).toBe(231);
    expect(reloaded?.decisions.find((item) => item.dimensionCode === "AUTONOMY")?.selectedLevelCode)
      .toBe("A2");
  });

  it("assigns validated cases to holdout without changing their expert result", async () => {
    const source = await createApprovedSource("gold-holdout");
    const captured = await goldService.captureApprovedValuation(
      source.organization.id,
      source.valuation.id,
      {
        caseCode: "GS-HOLDOUT",
        anonymizedLabel: "Referencia holdout",
      },
    );

    expect(captured.case.partition).toBe("UNASSIGNED");
    const updated = await goldService.assignPartition(
      source.organization.id,
      captured.case.id,
      "HOLDOUT",
    );

    expect(updated.partition).toBe("HOLDOUT");
    expect(updated.expectedTotalPoints).toBe(231);
    expect(updated.expectedGradeCode).toBe("G3");
  });
});
