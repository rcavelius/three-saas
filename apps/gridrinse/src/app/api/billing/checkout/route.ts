import { getPlatform } from "@/server/platform";
import { checkoutRouteHandler } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return checkoutRouteHandler(await getPlatform(), req);
}
