import { appLogger } from "@/lib/log";
import { cleanupExpired } from "@/lib/cleanup";
import { getDb } from "@/lib/db";
import { apiError, json } from "@/lib/http";
import { safeEqual } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = appLogger("cron-cleanup");

/** Called by a scheduler with `Authorization: Bearer $CRON_SECRET`. Disabled (503) when unset. */
async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return apiError(503, "cron_disabled", "CRON_SECRET is not configured.");
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!safeEqual(given, secret)) return apiError(401, "unauthorized", "Bad or missing cron secret.");
  const { executor } = await getDb();
  const result = await cleanupExpired(executor);
  log.info("cleanup finished", { ...result });
  return json({ ok: true, ...result });
}

export const GET = run;
export const POST = run;
