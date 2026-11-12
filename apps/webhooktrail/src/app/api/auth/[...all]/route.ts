import { apiError } from "@/lib/http";
import { getPlatform, type Platform } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Seats are enforced by Better Auth only when an invitation is ACCEPTED. Refuse the invitation
 * itself when members + pending invitations already fill the plan's `teamSeats`, so nobody gets an
 * email for a seat that does not exist.
 */
async function seatCheck(p: Platform, req: Request, body: ArrayBuffer): Promise<Response | null> {
  let orgId: string | null = null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as { organizationId?: unknown };
    if (typeof parsed.organizationId === "string") orgId = parsed.organizationId;
  } catch {
    return null; // Better Auth answers the malformed body itself
  }
  const s = await p.auth.getSession(req.headers);
  if (!s) return null;
  orgId ??= (s.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
  if (!orgId) return null;
  const { rows } = await p.ex.query<{ members: number; pending: number }>(
    `SELECT (SELECT count(*)::int FROM auth_member WHERE organization_id = $1) AS members,
            (SELECT count(*)::int FROM auth_invitation WHERE organization_id = $1 AND status = 'pending' AND expires_at > now()) AS pending`,
    [orgId],
  );
  const seats = (await p.billing.getEntitlements(orgId)).limits.teamSeats ?? 1;
  const used = Number(rows[0]?.members ?? 0) + Number(rows[0]?.pending ?? 0);
  if (seats >= 0 && used >= seats) {
    return apiError(403, "SEAT_LIMIT_REACHED", `Your plan includes ${seats} seat${seats === 1 ? "" : "s"}, and all are taken or invited. Upgrade to Pro for team seats.`);
  }
  return null;
}

/**
 * Better Auth routes. Client IP for auth rate limiting comes from createAuth's resolveClientIp
 * (same TRUSTED_PROXY rule as every other limit; client-sent values are overwritten).
 */
async function handler(req: Request): Promise<Response> {
  const p = await getPlatform();
  const headers = new Headers(req.headers);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;
  if (body && new URL(req.url).pathname.endsWith("/organization/invite-member")) {
    const refused = await seatCheck(p, req, body);
    if (refused) return refused;
  }
  const forwarded = new Request(req.url, { method: req.method, headers, body, signal: req.signal });
  return p.auth.handler(forwarded);
}

export const GET = handler;
export const POST = handler;
