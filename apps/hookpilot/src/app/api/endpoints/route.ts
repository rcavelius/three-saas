import { rateLimit } from "@repo/database";
import { apiContext } from "@/lib/api";
import { createAnonEndpoint, listOwnedEndpoints, toEndpointDTO } from "@/lib/endpoints";
import { apiError, appOrigin, json, readJsonBody, tooManyRequests } from "@/lib/http";
import { sha256Hex } from "@/lib/ids";
import { ensureOwnerToken, ownerCookieHeader } from "@/lib/owner";
import { limits } from "@/lib/plans";
import { createEndpointSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the caller's endpoints (empty list when there is no owner cookie). */
export async function GET(req: Request): Promise<Response> {
  const ctx = await apiContext(req, { mutating: false });
  if (ctx instanceof Response) return ctx;
  if (!ctx.owner) return json({ endpoints: [] });
  const rows = await listOwnedEndpoints(ctx.ex, ctx.owner);
  const origin = appOrigin(req);
  return json({ endpoints: rows.map((r) => toEndpointDTO(r, origin)) });
}

/** Create an anonymous endpoint; mints the owner cookie on first use. */
export async function POST(req: Request): Promise<Response> {
  const ctx = await apiContext(req, { mutating: true });
  if (ctx instanceof Response) return ctx;
  const input = await readJsonBody(req, createEndpointSchema);
  if (!input.ok) return input.res;

  const rl = await rateLimit(ctx.ex, `hp:create:ip:${ctx.ip}`, limits.createPerIpPerHour, 3_600_000);
  if (!rl.allowed) return tooManyRequests(rl.resetAt, "Too many endpoints created from this IP. Try again later.");

  const { token, isNew } = ensureOwnerToken(req);
  const result = await createAnonEndpoint(ctx.ex, sha256Hex(token), { name: input.data.name });
  if (!result.ok) {
    return apiError(
      429,
      "endpoint_limit",
      `Free endpoints are limited to ${limits.anonActiveEndpoints} active at a time. Delete one or wait for it to expire.`,
    );
  }
  const headers = new Headers();
  if (isNew) headers.append("Set-Cookie", ownerCookieHeader(token));
  return json({ endpoint: toEndpointDTO(result.row, appOrigin(req)) }, { status: 201, headers });
}
