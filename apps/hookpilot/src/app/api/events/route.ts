import { eventsRoute } from "@repo/ops/next";
import { getPlatform } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** First-party analytics beacons (allow-listed names, same-origin, rate limited per client IP). */
export async function POST(req: Request): Promise<Response> {
  const p = await getPlatform();
  return eventsRoute({
    handle: p.handle,
    clientIp: p.clientIp,
    rateLimit: { limit: 60, windowMs: 60_000 },
    allowedOrigins: [p.appUrl],
    getUserId: async (r) => (await p.auth.getSession(r.headers))?.user.id ?? null,
  })(req);
}
