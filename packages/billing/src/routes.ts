/**
 * Next.js App Router handler factories (Web Request/Response only, no next/* import).
 *
 *   // app/api/billing/checkout/route.ts
 *   export const POST = checkoutRoute(billing, async (req) => {
 *     const { org, user } = await auth.requireOrg(req.headers, { role: "owner" });
 *     return { orgId: org.id, email: user.email };
 *   });
 *   // app/api/billing/webhook/route.ts   (export const runtime = "nodejs")
 *   export const POST = webhookRoute(billing);
 *
 * Billing never imports auth: the app injects `resolveOwnerOrg`, which must authenticate the
 * request and require the `owner` role, throwing an error with a numeric `status` (401/403/404)
 * otherwise. The org id ALWAYS comes from the resolver, never from the request body.
 */
import { z } from "zod";
import { isBillingError, safeReturnPath, type Billing } from "./billing";
import { BillingNotConfiguredError } from "./gateway";

export interface OwnerOrg {
  orgId: string;
  /** Used as the Stripe customer email on first checkout. */
  email: string;
}
export type ResolveOwnerOrg = (req: Request) => Promise<OwnerOrg | null>;

const MAX_WEBHOOK_BYTES = 1024 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function statusOf(e: unknown): number | null {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" && s >= 400 && s < 600 ? s : null;
}

/** Same-origin check for state-changing browser POSTs (CSRF defence in depth on top of SameSite cookies). */
function sameOrigin(req: Request, appUrl: string): boolean {
  const origin = req.headers.get("origin");
  if (origin) return origin === appUrl;
  // Browsers send Origin on every POST; without it, only accept an explicit same-origin fetch.
  return req.headers.get("sec-fetch-site") === "same-origin";
}

async function authorize(req: Request, billing: Billing, resolve: ResolveOwnerOrg): Promise<OwnerOrg | Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!sameOrigin(req, billing.appUrl)) return json(403, { error: "cross_origin" });
  try {
    const org = await resolve(req);
    if (!org || !org.orgId) return json(401, { error: "unauthorized" });
    return org;
  } catch (e) {
    const s = statusOf(e);
    if (s) return json(s, { error: s === 401 ? "unauthorized" : s === 403 ? "forbidden" : "not_found" });
    throw e;
  }
}

function isForm(req: Request): boolean {
  const ct = req.headers.get("content-type") ?? "";
  return ct.startsWith("application/x-www-form-urlencoded") || ct.startsWith("multipart/form-data");
}

function respondUrl(req: Request, url: string): Response {
  // HTML form posts (no JS) get a redirect; fetch() callers get JSON.
  if (isForm(req)) return new Response(null, { status: 303, headers: { location: url, "cache-control": "no-store" } });
  return json(200, { url });
}

function billingErrorResponse(e: unknown): Response {
  if (e instanceof BillingNotConfiguredError || (e as { code?: string } | null)?.code === "billing_not_configured") {
    return json(503, { error: "billing_not_configured", message: "Payments are not switched on yet." });
  }
  if (isBillingError(e)) {
    return json(e.status, { error: e.code, message: e.status < 500 ? e.message : "billing is not configured" });
  }
  return json(500, { error: "internal_error" });
}

const checkoutBody = z.object({ planId: z.string().min(1).max(40) });

/** POST { planId } -> { url } (or 303 for form posts). */
export function checkoutRoute(billing: Billing, resolveOwnerOrg: ResolveOwnerOrg) {
  return async (req: Request): Promise<Response> => {
    const auth = await authorize(req, billing, resolveOwnerOrg);
    if (auth instanceof Response) return auth;
    let planId: unknown;
    try {
      if (isForm(req)) planId = (await req.formData()).get("planId");
      else planId = ((await req.json()) as { planId?: unknown } | null)?.planId;
    } catch {
      return json(400, { error: "invalid_body" });
    }
    const parsed = checkoutBody.safeParse({ planId });
    if (!parsed.success) return json(400, { error: "invalid_plan" });
    try {
      const { url } = await billing.createCheckoutSession(auth.orgId, parsed.data.planId, auth.email);
      return respondUrl(req, url);
    } catch (e) {
      return billingErrorResponse(e);
    }
  };
}

/** POST -> { url } of a Stripe Billing Portal session (payment method, plan change, cancel). */
export function portalRoute(billing: Billing, resolveOwnerOrg: ResolveOwnerOrg) {
  return async (req: Request): Promise<Response> => {
    const auth = await authorize(req, billing, resolveOwnerOrg);
    if (auth instanceof Response) return auth;
    try {
      const { url } = await billing.createPortalSession(auth.orgId);
      return respondUrl(req, url);
    } catch (e) {
      return billingErrorResponse(e);
    }
  };
}

/** POST from Stripe. Reads the RAW body (signature is over the exact bytes). No auth/CSRF: the signature is the auth. */
export function webhookRoute(billing: Billing) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    const len = Number(req.headers.get("content-length") ?? "0");
    if (len > MAX_WEBHOOK_BYTES) return new Response("payload too large", { status: 413 });
    const raw = await req.text();
    if (raw.length > MAX_WEBHOOK_BYTES) return new Response("payload too large", { status: 413 });
    const r = await billing.handleWebhook(raw, req.headers.get("stripe-signature"));
    return new Response(r.body, {
      status: r.status,
      headers: { "content-type": r.status === 200 ? "application/json" : "text/plain", "cache-control": "no-store" },
    });
  };
}

// ---------------------------------------------------------------------------------------------
// One-time passes (no account needed)

export interface PassViewer {
  /** Signed-in org (optional): the pass also counts for every member of it. */
  orgId?: string | null;
  /** Prefills the Checkout email. */
  email?: string | null;
}
export type ResolvePassViewer = (req: Request) => Promise<PassViewer | null>;

const passBody = z.object({ passId: z.string().min(1).max(40), returnPath: z.string().max(300).optional() });

/**
 * POST { passId, returnPath? } -> { url } of a Stripe Checkout (mode "payment"), or 303 for form posts.
 * Same-origin only. Anonymous visitors may buy; resolveViewer (optional) attaches a signed-in org.
 */
export function passCheckoutRoute(billing: Billing, resolveViewer?: ResolvePassViewer) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (!sameOrigin(req, billing.appUrl)) return json(403, { error: "cross_origin" });
    let raw: { passId?: unknown; returnPath?: unknown };
    try {
      if (isForm(req)) {
        const f = await req.formData();
        raw = { passId: f.get("passId"), returnPath: f.get("returnPath") ?? undefined };
      } else {
        raw = ((await req.json()) as typeof raw | null) ?? {};
      }
    } catch {
      return json(400, { error: "invalid_body" });
    }
    const parsed = passBody.safeParse({ passId: raw.passId, returnPath: raw.returnPath ?? undefined });
    if (!parsed.success) return json(400, { error: "invalid_pass" });
    let viewer: PassViewer | null = null;
    if (resolveViewer) {
      try {
        viewer = await resolveViewer(req);
      } catch {
        viewer = null; // anonymous purchase still works
      }
    }
    try {
      const { url } = await billing.createPassCheckout(parsed.data.passId, {
        orgId: viewer?.orgId ?? null,
        email: viewer?.email ?? null,
        returnPath: parsed.data.returnPath,
      });
      return respondUrl(req, url);
    } catch (e) {
      return billingErrorResponse(e);
    }
  };
}

/**
 * GET ?session_id=cs_...&next=/path : Stripe's success redirect (and the buyer's reusable unlock link).
 * Verifies the session with Stripe, records the pass, sets the pass cookie and redirects to next?pass=<status>.
 */
export function passClaimRoute(billing: Billing) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
    const u = new URL(req.url);
    const next = safeReturnPath(u.searchParams.get("next"));
    const to = (status: string) => {
      const target = new URL(next, billing.appUrl);
      target.searchParams.set("pass", status);
      return target.pathname + target.search + target.hash;
    };
    const headers = new Headers({ "cache-control": "no-store", "referrer-policy": "no-referrer" });
    let status: string;
    try {
      const sessionId = u.searchParams.get("session_id") ?? "";
      const claim = await billing.claimPass(sessionId);
      status = claim.status;
      // "unpaid" (a delayed payment method): keep the signed reference so the pass unlocks in this browser once the
      // payment clears and the webhook records it.
      const cookie =
        claim.status === "active"
          ? billing.passSetCookie(claim.pass)
          : claim.status === "unpaid"
            ? billing.passSetCookie({ id: sessionId, expiresAt: null })
            : null;
      if (cookie) headers.append("set-cookie", cookie);
    } catch {
      status = "error";
    }
    headers.set("location", to(status));
    return new Response(null, { status: 303, headers });
  };
}
