import { checkoutRoute, portalRoute, webhookRoute, type ResolveOwnerOrg } from "@repo/billing";
import { getPlatform, type Platform } from "./platform";
import { json } from "./http";

const NOT_CONFIGURED = () =>
  json(503, {
    error: "billing_not_configured",
    message: "Online payments are not switched on yet. Nothing has been charged. Please try again later or contact support.",
  });

function resolver(p: Platform): ResolveOwnerOrg {
  return async (req) => {
    const { org, user } = await p.auth.requireOrg(req.headers, { role: "owner" });
    return { orgId: org.id, email: user.email };
  };
}

export async function checkoutHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  if (!p.billingEnabled) return NOT_CONFIGURED();
  return checkoutRoute(p.billing, resolver(p))(req);
}

export async function portalHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  if (!p.billingEnabled) return NOT_CONFIGURED();
  return portalRoute(p.billing, resolver(p))(req);
}

export async function webhookHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  if (!p.billingEnabled) return new Response("billing not configured", { status: 503 });
  return webhookRoute(p.billing)(req);
}
