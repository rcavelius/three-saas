import { getPlatform } from "@/server/platform";
import { templateFileRouteHandler } from "@/server/templateShop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Production: the Cloudflare Worker answers these signed links from private storage before they reach the app.
export async function GET(req: Request) {
  return templateFileRouteHandler(await getPlatform(), req);
}
