import { getPlatform } from "@/server/platform";
import { eventsRouteHandler } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return eventsRouteHandler(await getPlatform(), req);
}
