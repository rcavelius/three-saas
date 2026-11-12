import { ownedEndpointContext } from "@/lib/api";
import { apiError, json, notFound, readJsonBody } from "@/lib/http";
import { UUID_RE } from "@/lib/ids";
import { listReplays, startReplay } from "@/lib/replay";
import { replaySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; requestId: string }> };

/** Replay audit rows for this request (org-scoped). */
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { id, requestId } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: false, allowExpired: true });
  if (ctx instanceof Response) return ctx;
  if (!UUID_RE.test(requestId)) return notFound();
  if (!ctx.viewer.org || ctx.endpoint.org_id !== ctx.viewer.org.id) return json({ replays: [] });
  return json({ replays: await listReplays(ctx.ex, ctx.viewer.org.id, { requestId }) });
}

/**
 * Replay this captured request to one of the workspace's VERIFIED destinations.
 * Body: { destinationId, includeSensitiveHeaders?: string[], attempts?: 1..5 } (strict: no URL field).
 */
export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  const { id, requestId } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: true });
  if (ctx instanceof Response) return ctx;
  if (!UUID_RE.test(requestId)) return notFound();
  if (!ctx.viewer.user || !ctx.viewer.org) return apiError(401, "unauthenticated", "Sign in to replay requests.");
  const input = await readJsonBody(req, replaySchema);
  if (!input.ok) return input.res;
  const r = await startReplay(
    ctx.p,
    { orgId: ctx.viewer.org.id, userId: ctx.viewer.user.id, endpoint: ctx.endpoint, limits: ctx.limits },
    requestId,
    input.data,
  );
  if (!r.ok) {
    const headers = r.retryAfterSeconds ? { "Retry-After": String(r.retryAfterSeconds) } : undefined;
    return apiError(r.status, r.code, r.message, r.retryAfterSeconds ? { retryAfterSeconds: r.retryAfterSeconds } : {}, headers);
  }
  return json({ batchId: r.batchId, replays: r.replays, headers: r.headers }, { status: 201 });
}
