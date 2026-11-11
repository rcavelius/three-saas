import { getDb } from "@/lib/db";
import { getScan, SCAN_ID_PATTERN } from "@/lib/scans-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!SCAN_ID_PATTERN.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const scan = await getScan((await getDb()).executor, id);
  if (!scan) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(
    { id: scan.id, createdAt: scan.createdAt, report: scan.report },
    { headers: { "content-disposition": `inline; filename="siteproof-${id}.json"` } },
  );
}
