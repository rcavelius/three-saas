import { checkout } from "@/lib/billing-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { planId } -> { url } of a Stripe Checkout session (workspace owner only, same-origin). */
export const POST = checkout;
