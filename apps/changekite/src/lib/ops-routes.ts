import { cronTickRoute, eventsRoute, healthRoute } from "@repo/ops/next";
import { getPlatform } from "./platform";
import { ALL_EVENT_NAMES, EVENT_ALLOWED_PROPS } from "./events";

export async function cronTickHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  return cronTickRoute({ scheduler: p.scheduler, secret: p.env.CRON_SECRET, budgetMs: 50_000 })(req);
}

export async function healthHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  return healthRoute({
    handle: p.handle,
    version: p.env.GIT_SHA ?? "dev",
    detailsSecret: p.env.HEALTH_DETAILS_SECRET ?? p.env.CRON_SECRET,
    now: p.now,
  })(req);
}

export async function eventsHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  return eventsRoute({
    handle: p.handle,
    clientIp: p.clientIp,
    rateLimit: { limit: 60, windowMs: 60_000 },
    allowedOrigins: [p.env.APP_URL],
    allowedNames: ALL_EVENT_NAMES,
    allowedProps: EVENT_ALLOWED_PROPS,
    getUserId: async (r) => (await p.auth.getSession(r.headers))?.user.id ?? null,
    now: p.now,
  })(req);
}
