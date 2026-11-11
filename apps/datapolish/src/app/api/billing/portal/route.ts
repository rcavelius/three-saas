import { getPlatform } from "@/server/platform";
import { portalRouteHandler } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return portalRouteHandler(await getPlatform(), req);
}
