import { createCompensaAuth } from "../src/auth/server.js";
import { demoMethodology } from "../src/fixtures/demo-methodology.js";
import {
  CompensaRepository,
  createPool,
  runMigrations,
} from "../src/persistence/database.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

const databaseUrl = required("DATABASE_URL");
required("BETTER_AUTH_SECRET");
const email = required("COMPENSA_ADMIN_EMAIL").toLocaleLowerCase("en-US");
const password = required("COMPENSA_ADMIN_PASSWORD");
const name = process.env.COMPENSA_ADMIN_NAME?.trim() || "Compensa Admin";
const organizationSlug = process.env.COMPENSA_ORG_SLUG?.trim() || "compensa-demo";
const organizationName = process.env.COMPENSA_ORG_NAME?.trim() || "Compensa Demo";

if (password.length < 12) {
  throw new Error("COMPENSA_ADMIN_PASSWORD must contain at least 12 characters.");
}

const pool = createPool(databaseUrl);
const repository = new CompensaRepository(pool);

try {
  await runMigrations(pool);

  let organizationResult = await pool.query(
    "SELECT id FROM organizations WHERE slug = $1",
    [organizationSlug],
  );
  let organizationId = organizationResult.rows[0]?.id as string | undefined;
  if (organizationId === undefined) {
    const organization = await repository.createOrganization({
      slug: organizationSlug,
      name: organizationName,
      countryCode: "PE",
      currencyCode: "PEN",
    });
    organizationId = organization.id;
  }

  const methodologyResult = await pool.query(
    `SELECT id FROM methodology_versions
     WHERE organization_id = $1 AND code = $2 AND version = $3
     LIMIT 1`,
    [organizationId, demoMethodology.code, demoMethodology.version],
  );
  if (methodologyResult.rows.length === 0) {
    await repository.createMethodologyVersion({
      organizationId,
      definition: demoMethodology,
      contentOwner: "Compensa demo fixture",
      status: "ACTIVE",
    });
  }

  let userResult = await pool.query("SELECT id FROM auth_users WHERE email = $1", [email]);
  let userId = userResult.rows[0]?.id as string | undefined;
  if (userId === undefined) {
    const bootstrapAuth = createCompensaAuth({ allowSignUp: true });
    await bootstrapAuth.api.signUpEmail({
      body: { name, email, password },
    });
    userResult = await pool.query("SELECT id FROM auth_users WHERE email = $1", [email]);
    userId = userResult.rows[0]?.id as string | undefined;
    if (userId === undefined) {
      throw new Error("Better Auth created no user row for the bootstrap account.");
    }
  }

  await pool.query(
    `INSERT INTO organization_memberships
      (id, organization_id, user_id, role, status)
     VALUES (gen_random_uuid(), $1, $2, 'ADMIN', 'ACTIVE')
     ON CONFLICT (organization_id, user_id)
     DO UPDATE SET role = 'ADMIN', status = 'ACTIVE', updated_at = now()`,
    [organizationId, userId],
  );

  console.log(`Admin ready: ${email} → ${organizationSlug} (ADMIN)`);
} finally {
  await pool.end();
}
