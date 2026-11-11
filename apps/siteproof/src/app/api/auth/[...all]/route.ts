import { authRouteHandler } from "@/lib/auth-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = authRouteHandler;
export const POST = authRouteHandler;
