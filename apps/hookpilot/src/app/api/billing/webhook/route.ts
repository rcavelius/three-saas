import { webhook } from "@/lib/billing-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe webhooks (signature-verified on the raw body by @repo/billing). */
export const POST = webhook;
