import { checkoutRoute, portalRoute, webhookRoute, type ResolveOwnerOrg } from "@repo/billing";
import { AuthError } from "@repo/auth";
import { apiError, checkOrigin } from "./http";
import { getPlatform } from "./platform";

/** Billing actions require the org OWNER (org id from the session, never from the body). */
const resolveOwnerOrg: ResolveOwnerOrg = async (req) => {
  const p = await getPlatform();
  const { org, user } = await p.auth.requireOrg(req.headers, { role: "owner" });
  return { orgId: org.id, email: user.email };
};

function notConfigured(): Response {
  return apiError(503, "billing_not_configured", "Billing is not configured on this server yet. Your workspace stays on the Free plan.");
}

/**
 * @repo/billing's route Origin check lets a request with NO Origin and no Sec-Fetch-Site through
 * (non-browser clients). The app requires our exact Origin on every billing mutation, like on all
 * other mutating routes.
 */
async function strictOrigin(req: Request): Promise<Response | null> {
  const p = await getPlatform();
  return checkOrigin(req, p.appUrl);
}

export async function checkout(req: Request): Promise<Response> {
  const p = await getPlatform();
  const bad = await strictOrigin(req);
  if (bad) return bad;
  if (!p.billingConfigured) {
    // Still authenticate first so the 503 does not leak anything to anonymous callers.
    try {
      await resolveOwnerOrg(req);
    } catch (e) {
      if (e instanceof AuthError) return e.toResponse();
      throw e;
    }
    return notConfigured();
  }
  return checkoutRoute(p.billing, resolveOwnerOrg)(req);
}

export async function portal(req: Request): Promise<Response> {
  const p = await getPlatform();
  const bad = await strictOrigin(req);
  if (bad) return bad;
  if (!p.billingConfigured) {
    try {
      await resolveOwnerOrg(req);
    } catch (e) {
      if (e instanceof AuthError) return e.toResponse();
      throw e;
    }
    return notConfigured();
  }
  return portalRoute(p.billing, resolveOwnerOrg)(req);
}

export async function webhook(req: Request): Promise<Response> {
  const p = await getPlatform();
  return webhookRoute(p.billing)(req);
}
