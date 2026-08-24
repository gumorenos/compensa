import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("calibration web contract", () => {
  it("keeps HOLDOUT feedback hidden until the run is completed", async () => {
    const page = await source("app/calibration/[runId]/page.tsx");
    expect(page).toContain('const holdoutBlind = run.partition === "HOLDOUT" && !completed');
    expect(page).toContain('completed || (run.partition === "CALIBRATION" && item.comparison !== null)');
    expect(page).toContain("Las decisiones expertas, puntos, grado y métricas permanecen ocultos");
  });

  it("requires MANAGE_CALIBRATION on every calibration write Server Action", async () => {
    const actions = await source("src/web/calibration-actions.ts");
    expect(actions.match(/getAppContext\("MANAGE_CALIBRATION"\)/g)).toHaveLength(3);
    expect(actions).toContain("new CalibrationService(context.pool).saveCandidate");
    expect(actions).toContain("new CalibrationService(context.pool).completeRun");
  });

  it("never exposes AI as a working candidate source before an integration exists", async () => {
    const service = await source("src/application/calibration-service.ts");
    expect(service).toContain('"CALIBRATION_SOURCE_NOT_AVAILABLE"');
    expect(service).toContain('input.candidateSource ?? "MANUAL"');
  });
});
