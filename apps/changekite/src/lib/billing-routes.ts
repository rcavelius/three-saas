import { getPlatform } from "./platform";
import { json } from "./http";

const NOT_CONFIGURED = () =>
  json(503, {
    error: "billing_not_configured",
    message: "Online payments are not switched on yet. Nothing has been charged. Please try again later or contact support.",
  });

// The route factories are built inside createPlatform (same module instance as billing), so the
// package's `instanceof BillingError` mapping keeps working when Next splits code into chunks.
export async function checkoutHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  if (!p.billingEnabled) return NOT_CONFIGURED();
  return p.billingRoutes.checkout(req);
}

export async function portalHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  if (!p.billingEnabled) return NOT_CONFIGURED();
  return p.billingRoutes.portal(req);
}

export async function webhookHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  if (!p.billingEnabled) return new Response("billing not configured", { status: 503 });
  return p.billingRoutes.webhook(req);
}

/** POST {passId, returnPath} -> {url}: one-time pass Checkout (no account needed). */
export async function passCheckoutHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  if (!p.billingEnabled) return NOT_CONFIGURED();
  return p.billingRoutes.passCheckout(req);
}

/** GET ?session_id=…&next=…: Stripe success redirect and the buyer's reusable unlock link. */
export async function passClaimHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  return p.billingRoutes.passClaim(req);
}
