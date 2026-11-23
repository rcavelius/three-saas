import { passClaim } from "@/lib/billing-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe success redirect / unlock link: verifies the pass, sets the wt_pass cookie, 303 to next?pass=<status>. */
export const GET = passClaim;
