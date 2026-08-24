import {
  buildCalibrationCandidateTemplate,
} from "../../../../../../src/application/calibration-candidate-spreadsheet.js";
import { CalibrationRepository } from "../../../../../../src/persistence/calibration.js";
import { getAppContext } from "../../../../../../src/web/runtime.js";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string; format: string }> },
): Promise<Response> {
  const { runId, format } = await params;
  if (format !== "xlsx" && format !== "csv") return new Response("Not found", { status: 404 });

  const context = await getAppContext("MANAGE_CALIBRATION");
  const bundle = await new CalibrationRepository(context.pool).getRunBundle(context.organization.id, runId);
  if (bundle === null) return new Response("Not found", { status: 404 });

  const template = await buildCalibrationCandidateTemplate(bundle, format);
  const body = typeof template.body === "string" ? template.body : Buffer.from(template.body);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": template.contentType,
      "Content-Disposition": `attachment; filename="${template.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
