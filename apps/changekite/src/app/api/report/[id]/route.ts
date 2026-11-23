import { getPlatform } from "@/lib/platform";
import { loadReportView } from "@/lib/report-access";
import { SCAN_ID_PATTERN } from "@/lib/scans-repo";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * JSON export of a report: anonymous reports by link, account reports for org members only (404 otherwise).
 * Without fullReport (free viewers) it is the locked copy: summary + top issues, plus `locked` counts.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!SCAN_ID_PATTERN.test(id)) return json(404, { error: "Not found" });
  const view = await loadReportView(await getPlatform(), req.headers, id);
  if (!view) return json(404, { error: "Not found" });
  return json(
    200,
    { id: view.scan.id, createdAt: view.scan.createdAt, report: view.report, ...(view.locked ? { locked: view.locked } : {}) },
    { "content-disposition": `inline; filename="changekite-${id}.json"`, "x-robots-tag": "noindex", vary: "cookie" },
  );
}
