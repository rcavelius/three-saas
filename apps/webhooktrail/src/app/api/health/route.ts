import { healthRoute } from "@repo/ops/next";
import { getPlatform } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: { status, version }. Full report with `Authorization: Bearer $HEALTH_DETAILS_SECRET`. */
export async function GET(req: Request): Promise<Response> {
  const p = await getPlatform();
  return healthRoute({
    handle: p.handle,
    version: process.env.GIT_SHA ?? "dev",
    detailsSecret: process.env.HEALTH_DETAILS_SECRET,
  })(req);
}
