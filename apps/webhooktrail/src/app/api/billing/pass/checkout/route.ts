import { passCheckout } from "@/lib/billing-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { passId, returnPath } -> { url } of a one-time pass Checkout (anonymous allowed, same-origin only). */
export const POST = passCheckout;
