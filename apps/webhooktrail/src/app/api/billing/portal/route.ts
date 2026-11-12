import { portal } from "@/lib/billing-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST -> { url } of the Stripe billing portal (workspace owner only, same-origin). */
export const POST = portal;
