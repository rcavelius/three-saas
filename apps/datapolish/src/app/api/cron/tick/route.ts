import { getPlatform } from "@/server/platform";
import { cronRouteHandler } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  return cronRouteHandler(await getPlatform(), req);
}

export async function POST(req: Request) {
  return cronRouteHandler(await getPlatform(), req);
}
