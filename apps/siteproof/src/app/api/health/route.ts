import { healthHandler } from "@/lib/ops-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = healthHandler;
