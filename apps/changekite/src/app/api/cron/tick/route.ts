import { cronTickHandler } from "@/lib/ops-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = cronTickHandler;
export const POST = cronTickHandler;
