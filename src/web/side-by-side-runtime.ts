import { InternalComparablesService, type ApprovedValuationSummary } from "../application/comparables-service.js";
import {
  SideBySideComparisonError,
  SideBySideComparisonService,
  type SideBySideComparisonErrorCode,
  type SideBySideComparisonReport,
} from "../application/side-by-side-comparison.js";
import { getAppContext, type AppContext } from "./runtime.js";

export interface SideBySideComparisonPageData {
  context: AppContext;
  valuations: ApprovedValuationSummary[];
  selectedValuationIds: string[];
  report: SideBySideComparisonReport | null;
  errorCode: SideBySideComparisonErrorCode | null;
}

export async function getSideBySideComparisonPageData(
  requestedValuationIds: readonly string[],
): Promise<SideBySideComparisonPageData> {
  const context = await getAppContext("VIEW");
  const valuations = await new InternalComparablesService(context.pool).listApprovedValuations(
    context.organization.id,
  );
  const selectedValuationIds = normalizeIds(requestedValuationIds);
  if (selectedValuationIds.length === 0) {
    return {
      context,
      valuations,
      selectedValuationIds,
      report: null,
      errorCode: null,
    };
  }

  try {
    const report = await new SideBySideComparisonService(context.pool).getReport(
      context.organization.id,
      selectedValuationIds,
    );
    return {
      context,
      valuations,
      selectedValuationIds,
      report,
      errorCode: null,
    };
  } catch (error) {
    if (error instanceof SideBySideComparisonError) {
      return {
        context,
        valuations,
        selectedValuationIds,
        report: null,
        errorCode: error.code,
      };
    }
    throw error;
  }
}

function normalizeIds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
