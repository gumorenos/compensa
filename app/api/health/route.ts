import { NextResponse } from "next/server";
import type { Pool } from "pg";
import { createPool } from "../../../src/persistence/database.js";

type HealthGlobal = typeof globalThis & { __compensaHealthPool?: Pool };

function healthPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required for the health check.");
  }

  const runtime = globalThis as HealthGlobal;
  runtime.__compensaHealthPool ??= createPool(databaseUrl);
  return runtime.__compensaHealthPool;
}

export async function GET() {
  try {
    await healthPool().query("SELECT 1");
    return NextResponse.json(
      { status: "ok" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
