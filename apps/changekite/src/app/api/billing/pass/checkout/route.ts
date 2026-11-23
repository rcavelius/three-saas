import { passCheckoutHandler } from "@/lib/billing-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = passCheckoutHandler;
