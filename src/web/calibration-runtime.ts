import { CalibrationService, type CalibrationRunView } from "../application/calibration-service.js";
import { roleHasPermission } from "../auth/access.js";
import type { CalibrationRun } from "../persistence/calibration.js";
import { getAppContext } from "./runtime.js";

export interface CalibrationListPageData {
  runs: CalibrationRun[];
  scopes: Awaited<ReturnType<CalibrationService["listAvailableScopes"]>>;
  canManage: boolean;
}

export async function getCalibrationListPageData(): Promise<CalibrationListPageData> {
  const context = await getAppContext("VIEW");
  const service = new CalibrationService(context.pool);
  const [runs, scopes] = await Promise.all([
    service.listRuns(context.organization.id),
    service.listAvailableScopes(context.organization.id),
  ]);
  return {
    runs,
    scopes,
    canManage: roleHasPermission(context.access.role, "MANAGE_CALIBRATION"),
  };
}

export async function getCalibrationRunPageData(runId: string): Promise<{
  view: CalibrationRunView;
  canManage: boolean;
} | null> {
  const context = await getAppContext("VIEW");
  const view = await new CalibrationService(context.pool).getRunView(context.organization.id, runId);
  if (view === null) return null;
  return {
    view,
    canManage: roleHasPermission(context.access.role, "MANAGE_CALIBRATION"),
  };
}
