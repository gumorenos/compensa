import {
  GoldStandardCoverageService,
  type GoldStandardCoverageReport,
} from "../application/gold-standard-coverage.js";
import { getAppContext, type AppContext } from "./runtime.js";

export interface GoldStandardCoveragePageData {
  context: AppContext;
  report: GoldStandardCoverageReport;
}

export async function getGoldStandardCoveragePageData(): Promise<GoldStandardCoveragePageData> {
  const context = await getAppContext("VIEW");
  const report = await new GoldStandardCoverageService(context.pool).getReport(context.organization.id);
  return { context, report };
}
