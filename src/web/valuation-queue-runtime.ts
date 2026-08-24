import {
  ValuationQueueFilterError,
  ValuationQueueService,
  emptyValuationQueueFilters,
  parseValuationQueueFilters,
  type ValuationQueueFilterInput,
  type ValuationQueueFilters,
  type ValuationQueueResult,
} from "../application/valuation-queue-service.js";
import { getAppContext, type AppContext } from "./runtime.js";

export interface ValuationQueuePageData {
  context: AppContext;
  filters: ValuationQueueFilters;
  queue: ValuationQueueResult;
  invalidFilter: string | null;
}

export async function getValuationQueuePageData(
  input: ValuationQueueFilterInput,
): Promise<ValuationQueuePageData> {
  const context = await getAppContext("VIEW");
  let filters = emptyValuationQueueFilters();
  let invalidFilter: string | null = null;

  try {
    filters = parseValuationQueueFilters(input);
  } catch (error) {
    if (!(error instanceof ValuationQueueFilterError)) throw error;
    invalidFilter = error.field;
  }

  const queue = await new ValuationQueueService(context.pool).getQueue(
    context.organization.id,
    filters,
  );

  return { context, filters, queue, invalidFilter };
}
