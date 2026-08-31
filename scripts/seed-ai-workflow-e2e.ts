import { writeFile } from "node:fs/promises";
import { createCompensaAuth } from "../src/auth/server.js";
import { ValuationService } from "../src/application/valuation-service.js";
import { demoMethodology } from "../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../src/persistence/database.js";
import type { OrganizationRole } from "../src/auth/access.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

const databaseUrl = required("DATABASE_URL");
required("BETTER_AUTH_SECRET");
const outputPath = required("COMPENSA_E2E_FIXTURE_PATH");

const credentials = {
  admin: {
    email: "admin-ai-e2e@example.com",
    password: "Compensa-E2E-Admin-2026!",
    name: "AI E2E Admin",
    role: "ADMIN" as const,
  },
  evaluator: {
    email: "evaluator-ai-e2e@example.com",
    password: "Compensa-E2E-Evaluator-2026!",
    name: "AI E2E Evaluator",
    role: "EVALUATOR" as const,
  },
  reviewer: {
    email: "reviewer-ai-e2e@example.com",
    password: "Compensa-E2E-Reviewer-2026!",
    name: "AI E2E Reviewer",
    role: "REVIEWER" as const,
  },
};

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);
const valuationService = new ValuationService(repository);

try {
  await runMigrations(pool);
  await pool.query("TRUNCATE organizations, auth_users RESTART IDENTITY CASCADE");

  const organization = await repository.createOrganization({
    slug: "ai-workflow-e2e",
    name: "AI Workflow E2E",
    countryCode: "PE",
    currencyCode: "PEN",
  });

  const methodology = await repository.createMethodologyVersion({
    organizationId: organization.id,
    definition: demoMethodology,
    contentOwner: "Compensa deterministic E2E fixture",
    status: "ACTIVE",
  });

  const job = await repository.createJob(organization.id, {
    code: "E2E-AI-001",
    name: "Analista de Planeamiento E2E",
    department: "Finanzas",
    area: "Planeamiento",
    jobFamily: "Finance",
  });
  const description = await repository.createJobDescriptionVersion(organization.id, job.id, {
    content:
      "Responsable de análisis financiero y coordinación transversal con líderes de distintas áreas. " +
      "Resuelve problemas dentro de políticas definidas, documenta sus decisiones y prepara escenarios para la dirección. " +
      "No tiene personal directo a cargo.",
    sourceLabel: "AI browser E2E fixture",
  });
  const valuation = await valuationService.startValuation(
    organization.id,
    job.id,
    methodology.id,
  );
  if (valuation.jobDescriptionVersionId !== description.id) {
    throw new Error("E2E valuation did not pin the expected job-description version.");
  }

  const noDescriptionJob = await repository.createJob(organization.id, {
    code: "E2E-AI-002",
    name: "Puesto sin descriptivo E2E",
    department: "Finanzas",
    area: "Planeamiento",
    jobFamily: "Finance",
  });
  const noDescriptionValuation = await valuationService.startValuation(
    organization.id,
    noDescriptionJob.id,
    methodology.id,
  );
  if (noDescriptionValuation.jobDescriptionVersionId !== null) {
    throw new Error("No-description E2E valuation unexpectedly pinned a description.");
  }

  const bootstrapAuth = createCompensaAuth({ allowSignUp: true, database: pool });
  const users: Record<keyof typeof credentials, { id: string; email: string; password: string }> = {
    admin: { id: "", email: credentials.admin.email, password: credentials.admin.password },
    evaluator: { id: "", email: credentials.evaluator.email, password: credentials.evaluator.password },
    reviewer: { id: "", email: credentials.reviewer.email, password: credentials.reviewer.password },
  };

  for (const [key, account] of Object.entries(credentials) as Array<
    [keyof typeof credentials, { email: string; password: string; name: string; role: OrganizationRole }]
  >) {
    await bootstrapAuth.api.signUpEmail({
      body: {
        name: account.name,
        email: account.email,
        password: account.password,
      },
    });
    const result = await pool.query("SELECT id FROM auth_users WHERE email = $1", [account.email]);
    const userId = result.rows[0]?.id as string | undefined;
    if (userId === undefined) {
      throw new Error(`Better Auth did not persist E2E user ${account.email}.`);
    }
    users[key] = { id: userId, email: account.email, password: account.password };
    await pool.query(
      `INSERT INTO organization_memberships
        (id, organization_id, user_id, role, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE')`,
      [organization.id, userId, account.role],
    );
  }

  const manifest = {
    organizationId: organization.id,
    methodologyVersionId: methodology.id,
    valuationId: valuation.id,
    noDescriptionValuationId: noDescriptionValuation.id,
    users,
  };

  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`AI workflow E2E fixture ready: ${outputPath}`);
} finally {
  await pool.end();
}
