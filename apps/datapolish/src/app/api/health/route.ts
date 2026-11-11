import { getPlatform } from "@/server/platform";
import { healthRouteHandler } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    return await healthRouteHandler(await getPlatform(), req);
  } catch {
    // Platform could not start (e.g. database unreachable): report down without details.
    return new Response(JSON.stringify({ status: "down", version: process.env.GIT_SHA ?? "dev" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}
