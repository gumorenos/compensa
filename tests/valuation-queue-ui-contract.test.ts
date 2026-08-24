import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("valuation work queue web contract", () => {
  it("uses general VIEW access and keeps query parsing outside PostgreSQL", async () => {
    const runtime = await source("src/web/valuation-queue-runtime.ts");
    expect(runtime).toContain('getAppContext("VIEW")');
    expect(runtime).toContain("parseValuationQueueFilters(input)");
    expect(runtime).toContain("ValuationQueueFilterError");
  });

  it("exposes the work queue in role-aware navigation", async () => {
    const navigation = await source("app/app-nav-links.tsx");
    expect(navigation).toContain('href="/valuations"');
    expect(navigation).toContain(">Valoraciones</Link>");
  });

  it("provides operational filters and direct links to immutable valuation versions", async () => {
    const page = await source("app/valuations/page.tsx");
    for (const field of [
      'name="q"',
      'name="status"',
      'name="area"',
      'name="jobFamily"',
      'name="gradeCode"',
      'name="methodologyVersionId"',
      'name="actorUserId"',
      'name="dateFrom"',
      'name="dateTo"',
    ]) {
      expect(page).toContain(field);
    }
    expect(page).toContain("/valuations/${item.valuationId}");
    expect(page).toContain("Mostrando primeras 200");
  });

  it("has no Gold Standard or HOLDOUT data path", async () => {
    const service = await source("src/application/valuation-queue-service.ts");
    const runtime = await source("src/web/valuation-queue-runtime.ts");
    expect(service).not.toMatch(/gold_standard_|HOLDOUT/i);
    expect(runtime).not.toMatch(/gold_standard_|HOLDOUT/i);
  });
});
