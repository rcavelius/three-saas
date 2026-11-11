import { rateLimit } from "@repo/database";
import { apiContext } from "@/lib/api";
import { createEndpoint, listAnonEndpoints, listOrgEndpoints, toEndpointDTO } from "@/lib/endpoints";
import { apiError, json, readJsonBody, tooManyRequests } from "@/lib/http";
import { sha256Hex } from "@/lib/ids";
import { orgLimits } from "@/lib/org-data";
import { ensureOwnerToken, ownerCookieHeader } from "@/lib/owner";
import { FREE_LIMITS, limits } from "@/lib/plans";
import { createEndpointSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The caller's endpoints: `endpoints` = the signed-in workspace's (all members see them),
 * `anonymous` = unclaimed endpoints of this browser's owner cookie (claimable after sign-in).
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = await apiContext(req, { mutating: false });
  if (ctx instanceof Response) return ctx;
  const { p, viewer } = ctx;
  const out: { endpoints: unknown[]; anonymous: unknown[]; signedIn: boolean } = { endpoints: [], anonymous: [], signedIn: Boolean(viewer.user) };
  if (viewer.org) {
    const lim = await orgLimits(p, viewer.org.id);
    out.endpoints = (await listOrgEndpoints(ctx.ex, viewer.org.id)).map((r) => toEndpointDTO(r, p.appUrl, lim, viewer));
  }
  if (viewer.anonHash) {
    const anon = (await listAnonEndpoints(ctx.ex, viewer.anonHash)).map((r) => toEndpointDTO(r, p.appUrl, FREE_LIMITS, viewer));
    if (viewer.org) out.anonymous = anon;
    else out.endpoints = anon;
  }
  return json(out);
}

/** Create an endpoint: in the signed-in workspace, or anonymously (mints the owner cookie on first use). */
export async function POST(req: Request): Promise<Response> {
  const ctx = await apiContext(req, { mutating: true });
  if (ctx instanceof Response) return ctx;
  const input = await readJsonBody(req, createEndpointSchema);
  if (!input.ok) return input.res;
  const { p, viewer } = ctx;

  const rl = await rateLimit(ctx.ex, `hp:create:${ctx.ip.key}`, limits.createPerIpPerHour, 3_600_000);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, "Too many endpoints created from this IP. Try again later.");

  if (viewer.user && viewer.org) {
    const result = await createEndpoint(p, { orgId: viewer.org.id, userId: viewer.user.id }, { name: input.data.name });
    if (!result.ok) {
      return apiError(
        403,
        "endpoint_limit",
        `Your plan allows ${result.limit} active endpoints. Delete one or upgrade for more.`,
        { limit: result.limit },
      );
    }
    return json({ endpoint: toEndpointDTO(result.row, p.appUrl, result.limits, viewer) }, { status: 201 });
  }

  const { token, isNew } = ensureOwnerToken(req);
  const anonHash = sha256Hex(token);
  const result = await createEndpoint(p, { anonHash }, { name: input.data.name });
  if (!result.ok) {
    return apiError(
      403,
      "endpoint_limit",
      `Free endpoints are limited to ${result.limit} active at a time. Delete one, wait for one to expire, or sign up.`,
      { limit: result.limit },
    );
  }
  const headers = new Headers();
  if (isNew) headers.append("Set-Cookie", ownerCookieHeader(token));
  return json({ endpoint: toEndpointDTO(result.row, p.appUrl, FREE_LIMITS, { ...viewer, anonHash }) }, { status: 201, headers });
}
