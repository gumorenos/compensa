import { createPool, runMigrations } from "../src/persistence/database.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required.");
}

const pool = createPool(databaseUrl);
try {
  await runMigrations(pool);
  const result = await pool.query(
    "SELECT name, applied_at FROM schema_migrations ORDER BY name",
  );
  console.log(`Migrations ready: ${result.rows.length}`);
  for (const row of result.rows) {
    console.log(`- ${String(row.name)}`);
  }
} finally {
  await pool.end();
}
