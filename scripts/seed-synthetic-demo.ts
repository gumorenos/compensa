import { seedSyntheticDemoData } from "../src/application/synthetic-demo-seed.js";
import { SYNTHETIC_DEMO_CONFIRMATION } from "../src/fixtures/synthetic-demo-data.js";
import { createPool, runMigrations } from "../src/persistence/database.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required.`);
  return value.trim();
}

const confirmation = required("COMPENSA_DEMO_SEED_CONFIRM");
if (confirmation !== SYNTHETIC_DEMO_CONFIRMATION) {
  throw new Error(`COMPENSA_DEMO_SEED_CONFIRM must equal ${SYNTHETIC_DEMO_CONFIRMATION}.`);
}

const databaseUrl = required("DATABASE_URL");
const organizationSlug = required("COMPENSA_ORG_SLUG");
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
