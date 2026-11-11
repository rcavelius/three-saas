import { createHash } from "node:crypto";
import { ownedEndpointContext } from "@/lib/api";
import { apiError, json } from "@/lib/http";
import { clearRequests, listRequests, requestStats } from "@/lib/requests";
import { listRequestsQuerySchema, searchParamsToObject } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * ?method=&q=&from=&to=&before=<cursor>|after=<cursor>&limit=
 * Supports ETag / If-None-Match: 304 (no body) when nothing changed for this exact query, so live
 * polling is cheap. The ETag covers the endpoint's newest sequence number, the stored count and
 * the full query string.
 */
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: false });
  if (ctx instanceof Response) return ctx;
  const url = new URL(req.url);
  const parsed = listRequestsQuerySchema.safeParse(searchParamsToObject(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "validation_failed", "Invalid query.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const stats = await requestStats(ctx.ex, ctx.endpoint.id);
  const tag = `W/"${createHash("sha256")
    .update(`${ctx.endpoint.id}|${stats.maxSeq}|${stats.count}|${url.searchParams.toString()}`)
    .digest("base64url")
    .slice(0, 27)}"`;
  const inm = req.headers.get("if-none-match");
  if (inm && inm.split(",").some((t) => t.trim() === tag)) {
    return new Response(null, { status: 304, headers: { ETag: tag, "Cache-Control": "no-store" } });
  }
  return json(await listRequests(ctx.ex, ctx.endpoint.id, parsed.data), { headers: { ETag: tag } });
}

/** Clear all captured requests. */
export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: true, allowExpired: true });
  if (ctx instanceof Response) return ctx;
  return json({ deleted: await clearRequests(ctx.ex, ctx.endpoint.id) });
}
