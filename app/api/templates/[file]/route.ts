import { requireRequestAccess, type Permission } from "../../../../src/auth/access.js";
import {
  buildSpreadsheetTemplate,
  type SpreadsheetTemplateFormat,
  type SpreadsheetTemplateKind,
} from "../../../../src/application/spreadsheet-templates.js";

export const dynamic = "force-dynamic";

interface TemplateRequest {
  kind: SpreadsheetTemplateKind;
  format: SpreadsheetTemplateFormat;
  permission: Permission;
}

const templates: Record<string, TemplateRequest> = {
  "gold-standard.csv": { kind: "gold-standard", format: "csv", permission: "MANAGE_GOLD_STANDARD" },
  "gold-standard.xlsx": { kind: "gold-standard", format: "xlsx", permission: "MANAGE_GOLD_STANDARD" },
  "methodology.csv": { kind: "methodology", format: "csv", permission: "MANAGE_METHODOLOGIES" },
  "methodology.xlsx": { kind: "methodology", format: "xlsx", permission: "MANAGE_METHODOLOGIES" },
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const requested = templates[file];
  if (requested === undefined) return new Response("Not found", { status: 404 });
  await requireRequestAccess(requested.permission);
  const template = await buildSpreadsheetTemplate(requested.kind, requested.format);
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
