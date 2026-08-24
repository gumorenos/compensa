import {
  OperationalOverviewService,
  type OperationalOverview,
} from "../application/operational-overview-service.js";
import { getAppContext, type AppContext } from "./runtime.js";

export interface OperationalOverviewPageData {
  context: AppContext;
  overview: OperationalOverview;
}

export async function getOperationalOverviewPageData(): Promise<OperationalOverviewPageData> {
  const context = await getAppContext("VIEW");
  const overview = await new OperationalOverviewService(context.pool).getOverview(
    context.organization.id,
  );
  return { context, overview };
}
