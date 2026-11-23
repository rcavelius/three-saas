import { checkoutRoute, passCheckoutRoute, passClaimRoute, portalRoute, webhookRoute, type ResolveOwnerOrg, type ResolvePassViewer } from "@repo/billing";
import { AuthError } from "@repo/auth";
import { apiError, checkOrigin } from "./http";
import { getPlatform } from "./platform";
import { getViewer } from "./viewer";

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

/** Signed-in member (any role) buying a pass: it then counts for the whole workspace. Anonymous: null. */
const resolvePassViewer: ResolvePassViewer = async (req) => {
  const p = await getPlatform();
  const v = await getViewer(p, req);
  return v.user ? { orgId: v.org?.id ?? null, email: v.user.email } : null;
};

/** POST { passId, returnPath } -> { url } of a one-time Stripe Checkout. No account needed; same-origin only. */
export async function passCheckout(req: Request): Promise<Response> {
  const p = await getPlatform();
  const bad = await strictOrigin(req);
  if (bad) return bad;
  if (!p.billingConfigured) return apiError(503, "billing_not_configured", "Payments are not configured on this server yet.");
  return passCheckoutRoute(p.billing, resolvePassViewer)(req);
}

/** GET ?session_id=&next= : Stripe success redirect and the buyer's reusable unlock link (sets the pass cookie). */
export async function passClaim(req: Request): Promise<Response> {
  const p = await getPlatform();
  const res = await passClaimRoute(p.billing)(req);
  // Payment still processing (e.g. bank debit): keep the session id so the page can offer "check again", which
  // re-runs this claim and sets the cookie once the payment has cleared.
  const loc = res.headers.get("location");
  const sid = new URL(req.url).searchParams.get("session_id");
  if (loc && sid && /^cs_[A-Za-z0-9_]{1,200}$/.test(sid) && new URL(loc, p.appUrl).searchParams.get("pass") === "unpaid") {
    const u = new URL(loc, p.appUrl);
    u.searchParams.set("pass_session", sid);
    res.headers.set("location", u.pathname + u.search + u.hash);
  }
  return res;
}
