import { cronTickRoute } from "@repo/ops/next";
import { getPlatform } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** External cron (every minute): `Authorization: Bearer $CRON_SECRET`. 503 when the secret is unset. */
async function tick(req: Request): Promise<Response> {
  const p = await getPlatform();
  return cronTickRoute({ scheduler: p.scheduler, secret: process.env.CRON_SECRET })(req);
}

export const GET = tick;
export const POST = tick;
