import {
  InternalComparablesService,
  type ApprovedValuationSummary,
  type InternalComparablesReport,
} from "../application/comparables-service.js";
import { getAppContext, type AppContext } from "./runtime.js";

export interface ComparablesPageData {
  context: AppContext;
  valuations: ApprovedValuationSummary[];
  selectedValuationId: string | null;
  report: InternalComparablesReport | null;
}

export async function getComparablesPageData(
  baseValuationId?: string,
): Promise<ComparablesPageData> {
  const context = await getAppContext("VIEW");
  const service = new InternalComparablesService(context.pool);
  const valuations = await service.listApprovedValuations(context.organization.id);
  const selectedValuationId = normalizeId(baseValuationId);
  const report =
    selectedValuationId === null
      ? null
      : await service.getReport(context.organization.id, selectedValuationId);

  return {
    context,
    valuations,
    selectedValuationId,
    report,
  };
}

function normalizeId(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
