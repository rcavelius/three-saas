import { requestScanNow } from "@/lib/monitoring/monitor";
import { json, notFound, orgRoute } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Queue an immediate scan of a monitored site (3 per site per hour; runs on the background queue). */
export const POST = orgRoute<Ctx>(async (_req, { p, org }, ctx) => {
  const { id } = await ctx.params;
  const r = await requestScanNow(p.monitor, org.id, id);
  switch (r) {
    case "not_found":
      return notFound();
    case "inactive":
      return json(409, { error: "inactive", message: "This site is paused. Resume it first." });
    case "already_queued":
      return json(202, { status: r, message: "A scan is already queued." });
    case "rate_limited":
      return json(429, { error: "rate_limited", message: "Manual scans are limited to 3 per site per hour." });
    default:
      return json(202, { status: r, message: "Scan queued. Results appear here in a few minutes." });
  }
});
