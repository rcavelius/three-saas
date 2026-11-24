import { getPlatform } from "@/server/platform";
import { templateCheckoutRouteHandler } from "@/server/templateShop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return templateCheckoutRouteHandler(await getPlatform(), req);
}
