import { getPlatform } from "@/lib/platform";
import { loadViewableScan } from "@/lib/report-access";
import { SCAN_ID_PATTERN } from "@/lib/scans-repo";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** JSON export of a report: anonymous reports by link, account reports for org members only (404 otherwise). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!SCAN_ID_PATTERN.test(id)) return json(404, { error: "Not found" });
  const scan = await loadViewableScan(await getPlatform(), req.headers, id);
  if (!scan) return json(404, { error: "Not found" });
  return json(
    200,
    { id: scan.id, createdAt: scan.createdAt, report: scan.report },
    { "content-disposition": `inline; filename="changekite-${id}.json"`, "x-robots-tag": "noindex" },
  );
}
