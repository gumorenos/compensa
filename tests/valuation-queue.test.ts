import { describe, expect, it } from "vitest";
import {
  ValuationQueueFilterError,
  emptyValuationQueueFilters,
  parseValuationQueueFilters,
} from "../src/application/valuation-queue-service.js";

describe("valuation queue filters", () => {
  it("normalizes supported filters and ignores duplicate query values after the first", () => {
    expect(parseValuationQueueFilters({
      status: "IN_REVIEW",
      area: " Finanzas ",
      jobFamily: "Finance",
      gradeCode: "G3",
      methodologyVersionId: "11111111-1111-1111-1111-111111111111",
      actorUserId: "22222222-2222-2222-2222-222222222222",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-24",
      q: [" planeamiento ", "ignored"],
    })).toEqual({
      status: "IN_REVIEW",
      area: "Finanzas",
      jobFamily: "Finance",
      gradeCode: "G3",
      methodologyVersionId: "11111111-1111-1111-1111-111111111111",
      actorUserId: "22222222-2222-2222-2222-222222222222",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-24",
      query: "planeamiento",
    });
  });

  it("returns an explicit empty filter object", () => {
    expect(parseValuationQueueFilters({})).toEqual(emptyValuationQueueFilters());
  });

  it.each([
    [{ status: "BROKEN" }, "status"],
    [{ methodologyVersionId: "not-a-uuid" }, "methodologyVersionId"],
    [{ actorUserId: "not-a-uuid" }, "actorUserId"],
    [{ dateFrom: "2026-02-31" }, "dateFrom"],
    [{ dateTo: "24-08-2026" }, "dateTo"],
    [{ dateFrom: "2026-08-24", dateTo: "2026-08-01" }, "dateRange"],
  ] as const)("rejects malformed URL filters without sending them to PostgreSQL: %j", (input, field) => {
    expect(() => parseValuationQueueFilters(input)).toThrowError(
      expect.objectContaining<Partial<ValuationQueueFilterError>>({ field }),
    );
  });

  it("bounds free-text filters", () => {
    expect(() => parseValuationQueueFilters({ q: "x".repeat(201) })).toThrowError(
      expect.objectContaining({ field: "q" }),
    );
  });
});
