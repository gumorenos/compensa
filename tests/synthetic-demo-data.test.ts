import { describe, expect, it } from "vitest";
import {
  assertSyntheticDemoOrganizationSlug,
  assertSyntheticDemoSeedConfirmation,
} from "../src/application/synthetic-demo-seed-guard.js";
import { evaluateValuation } from "../src/domain/scoring-engine.js";
import { demoMethodology } from "../src/fixtures/demo-methodology.js";
import {
  SYNTHETIC_DEMO_CONFIRMATION,
  SYNTHETIC_DEMO_MARKER,
  syntheticDemoJobs,
} from "../src/fixtures/synthetic-demo-data.js";

describe("synthetic demo data", () => {
  it("requires the exact explicit seed confirmation", () => {
    expect(() => assertSyntheticDemoSeedConfirmation(undefined)).toThrow(/COMPENSA_DEMO_SEED_CONFIRM/);
    expect(() => assertSyntheticDemoSeedConfirmation("true")).toThrow(/SYNTHETIC_STAGING_DATA/);
    expect(() => assertSyntheticDemoSeedConfirmation("SYNTHETIC_STAGING_DATA")).not.toThrow();
    expect(() => assertSyntheticDemoSeedConfirmation(" SYNTHETIC_STAGING_DATA ")).not.toThrow();
  });

  it("rejects production-like organization slugs", () => {
    expect(() => assertSyntheticDemoOrganizationSlug("compensa")).toThrow(/staging, demo, test, or qa/);
    expect(() => assertSyntheticDemoOrganizationSlug("compensa-prod")).toThrow(/staging, demo, test, or qa/);
    expect(() => assertSyntheticDemoOrganizationSlug("compensa-staging")).not.toThrow();
    expect(() => assertSyntheticDemoOrganizationSlug("client-demo-pe")).not.toThrow();
    expect(() => assertSyntheticDemoOrganizationSlug("qa_client")).not.toThrow();
  });

  it("uses reserved, unique and visibly synthetic identifiers", () => {
    expect(SYNTHETIC_DEMO_CONFIRMATION).toBe("SYNTHETIC_STAGING_DATA");
    expect(SYNTHETIC_DEMO_MARKER).toBe("SYNTHETIC_DEMO_V1");
    expect(new Set(syntheticDemoJobs.map((job) => job.code)).size).toBe(syntheticDemoJobs.length);
    expect(syntheticDemoJobs.every((job) => job.code.startsWith("SYN-DEMO-") && job.name.includes("DEMO"))).toBe(true);
  });

  it("covers the intended operational workflow states", () => {
    const statuses = new Set(syntheticDemoJobs.map((job) => job.targetStatus));
    expect(statuses).toEqual(
      new Set(["DRAFT_INCOMPLETE", "DRAFT_COMPLETE", "IN_REVIEW", "RETURNED", "APPROVED"]),
    );
  });

  it("keeps complete references reproducible by the deterministic engine", () => {
    for (const job of syntheticDemoJobs) {
      const result = evaluateValuation(demoMethodology, job.selections);
      if (job.targetStatus === "DRAFT_INCOMPLETE") {
        expect(result.status).toBe("ERROR");
        continue;
      }
      expect(result.status, job.code).toBe("SUCCESS");
      expect(result.points, job.code).not.toBeNull();
      expect(result.grade, job.code).not.toBeNull();
    }
  });

  it("creates Gold Standard only from approved synthetic valuations", () => {
    const references = syntheticDemoJobs.filter((job) => job.goldStandard !== undefined);
    expect(references).toHaveLength(3);
    expect(references.every((job) => job.targetStatus === "APPROVED")).toBe(true);
    expect(new Set(references.map((job) => job.goldStandard!.caseCode)).size).toBe(3);
    expect(references.filter((job) => job.goldStandard!.partition === "CALIBRATION")).toHaveLength(2);
    expect(references.filter((job) => job.goldStandard!.partition === "HOLDOUT")).toHaveLength(1);
    expect(references.filter((job) => job.goldStandard!.isAnchor)).toHaveLength(1);
  });
});
