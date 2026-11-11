import { getSite, removeSite, updateSite, type SitePatch } from "@/lib/monitoring/sites";
import { json, notFound, orgRoute, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = orgRoute<Ctx>(async (_req, { p, org }, ctx) => {
  const { id } = await ctx.params;
  const site = await getSite(p.handle.executor, org.id, id);
  if (!site) return notFound();
  const { orgId: _o, ...rest } = site;
  return json(200, { site: rest });
});

/** Settings: { paused?, alertsMuted?, alertRecipients?: userId[] } (recipients must be org members). */
export const PATCH = orgRoute<Ctx>(
  async (req, { p, org }, ctx) => {
    const { id } = await ctx.params;
    const body = await readJsonBody<Record<string, unknown>>(req);
    if (!body || typeof body !== "object") return json(400, { error: "invalid_input" });
    const patch: SitePatch = {};
    if ("paused" in body) {
      if (typeof body.paused !== "boolean") return json(400, { error: "invalid_input", message: "paused must be true or false" });
      patch.paused = body.paused;
    }
    if ("alertsMuted" in body) {
      if (typeof body.alertsMuted !== "boolean") return json(400, { error: "invalid_input", message: "alertsMuted must be true or false" });
      patch.alertsMuted = body.alertsMuted;
    }
    if ("alertRecipients" in body) {
      if (!Array.isArray(body.alertRecipients) || body.alertRecipients.some((x) => typeof x !== "string")) {
        return json(400, { error: "invalid_input", message: "alertRecipients must be a list of member ids" });
      }
      patch.alertRecipients = body.alertRecipients as string[];
    }
    const site = await updateSite(p.handle.executor, org.id, id, patch, p.now());
    if (!site) return notFound();
    const { orgId: _o, ...rest } = site;
    return json(200, { site: rest });
  },
  { role: "admin" },
);

export const DELETE = orgRoute<Ctx>(
  async (_req, { p, org }, ctx) => {
    const { id } = await ctx.params;
    const ok = await removeSite({ handle: p.handle, billing: p.billing }, org.id, id);
    return ok ? json(200, { deleted: true }) : notFound();
  },
  { role: "admin" },
);
