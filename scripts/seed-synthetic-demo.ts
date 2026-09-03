import {
  assertSyntheticDemoOrganizationSlug,
  assertSyntheticDemoSeedConfirmation,
} from "../src/application/synthetic-demo-seed-guard.js";
import { seedSyntheticDemoData } from "../src/application/synthetic-demo-seed.js";
import { createPool, runMigrations } from "../src/persistence/database.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required.`);
  return value.trim();
}

assertSyntheticDemoSeedConfirmation(process.env.COMPENSA_DEMO_SEED_CONFIRM);
const databaseUrl = required("DATABASE_URL");
const organizationSlug = required("COMPENSA_ORG_SLUG");
assertSyntheticDemoOrganizationSlug(organizationSlug);
const pool = createPool(databaseUrl);

try {
  await runMigrations(pool);
  const result = await seedSyntheticDemoData(pool, organizationSlug);
  console.log(
    `Synthetic demo ready for ${organizationSlug}: ${result.jobs} jobs, ${result.valuations} valuations, ${result.goldStandardCases} Gold Standard cases.`,
  );
} finally {
  await pool.end();
}
