import { addSite, listSites } from "@/lib/monitoring/sites";
import { json, orgRoute, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sites of the caller's active org. */
export const GET = orgRoute(async (_req, { p, org }) => {
  const sites = await listSites(p.handle.executor, org.id);
  const ents = await p.billing.getEntitlements(org.id);
  return json(200, {
    sites: sites.map(({ orgId: _o, ...s }) => s),
    limit: ents.limits.sites ?? 0,
    planId: ents.planId,
  });
});

/** Add a monitored site (plan `sites` gauge, counted under the org lock). Admins and owners only. */
export const POST = orgRoute(
  async (req, { p, org }) => {
    const body = await readJsonBody<{ url?: unknown }>(req);
    if (!body || typeof body.url !== "string") return json(400, { error: "invalid_input", message: 'Send JSON: {"url": "https://example.com"}' });
    const site = await addSite({ handle: p.handle, billing: p.billing, now: p.now }, org.id, body.url);
    const { orgId: _o, ...rest } = site;
    return json(201, { site: rest });
  },
  { role: "admin" },
);
