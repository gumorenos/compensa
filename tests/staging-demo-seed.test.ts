import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { evaluateValuation } from "../src/domain/scoring-engine.js";
import { demoMethodology } from "../src/fixtures/demo-methodology.js";
import {
  STAGING_DEMO_NOTES,
  STAGING_DEMO_SOURCE_LABEL,
  stagingDemoProfiles,
} from "../src/fixtures/staging-demo-data.js";

describe("synthetic staging demo fixture", () => {
  it("is explicitly synthetic, unique and covers the useful workflow states", () => {
    expect(STAGING_DEMO_SOURCE_LABEL).toBe("SYNTHETIC_DEMO_V1");
    expect(STAGING_DEMO_NOTES).toContain("SYNTHETIC / DEMO ONLY");
    expect(stagingDemoProfiles).toHaveLength(7);

    const codes = stagingDemoProfiles.map((profile) => profile.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => code.startsWith("SYN-DEMO-"))).toBe(true);
    expect(stagingDemoProfiles.every((profile) => profile.name.includes("sintético"))).toBe(true);

    expect(stagingDemoProfiles.map((profile) => profile.targetStatus)).toEqual([
      "DRAFT_PARTIAL",
      "DRAFT_COMPLETE",
      "IN_REVIEW",
      "RETURNED",
      "APPROVED",
      "APPROVED",
      "APPROVED",
    ]);

    const gold = stagingDemoProfiles.flatMap((profile) =>
      profile.goldStandard === undefined ? [] : [profile.goldStandard],
    );
    expect(gold).toHaveLength(3);
    expect(new Set(gold.map((item) => item.caseCode)).size).toBe(3);
    expect(gold.every((item) => item.caseCode.startsWith("SYN-GS-"))).toBe(true);
    expect(gold.map((item) => item.partition)).toEqual(["CALIBRATION", "CALIBRATION", "HOLDOUT"]);
  });

  it("spans deterministic grades without inventing a score for the partial draft", () => {
    const results = stagingDemoProfiles.map((profile) => ({
      code: profile.code,
      result: evaluateValuation(demoMethodology, profile.selections),
    }));

    expect(results[0]!.result.status).toBe("VALIDATION_ERROR");
    const grades = results.slice(1).map(({ result }) =>
      result.status === "SUCCESS" ? result.grade?.code : null,
    );
    expect(new Set(grades)).toEqual(new Set(["G1", "G2", "G3", "G4", "G5"]));
  });

  it("keeps the CLI opt-in and contains no destructive reset command", async () => {
    const script = await readFile(
      new URL("../scripts/seed-staging-demo.ts", import.meta.url),
      "utf8",
    );
    const seed = await readFile(
      new URL("../src/application/staging-demo-seed.ts", import.meta.url),
      "utf8",
    );

    expect(script).toContain('process.env.COMPENSA_DEMO_SEED_ENABLED !== "true"');
    expect(script).toContain('required("COMPENSA_ORG_SLUG")');
    expect(`${script}\n${seed}`).not.toMatch(/\bTRUNCATE\b/i);
    expect(`${script}\n${seed}`).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
