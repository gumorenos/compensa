import { seedStagingDemo } from "../src/application/staging-demo-seed.js";
import { createPool } from "../src/persistence/database.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
}

if (process.env.COMPENSA_DEMO_SEED_ENABLED !== "true") {
  throw new Error(
    "Synthetic staging seed is disabled. Set COMPENSA_DEMO_SEED_ENABLED=true explicitly to run it.",
  );
}

const databaseUrl = required("DATABASE_URL");
const organizationSlug = required("COMPENSA_ORG_SLUG");
const pool = createPool(databaseUrl);

try {
  const result = await seedStagingDemo(pool, organizationSlug);
  const created = result.items.filter(
    (item) => item.createdJob || item.createdDescription || item.createdValuation || item.createdGoldCase,
  ).length;
  const customized = result.items.filter((item) => item.customized).map((item) => item.code);

  console.log(
    JSON.stringify(
      {
        syntheticDemoSeed: "complete",
        organizationSlug: result.organizationSlug,
        profiles: result.items.length,
        profilesWithCreatedData: created,
        customizedProfilesLeftUntouched: customized,
        statuses: result.items.map((item) => ({ code: item.code, status: item.status })),
        goldCases: result.items
          .filter((item) => item.goldCaseCode !== null)
          .map((item) => item.goldCaseCode),
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
