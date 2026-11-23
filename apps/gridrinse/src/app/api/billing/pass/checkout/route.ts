import { getPlatform } from "@/server/platform";
import { passCheckoutRouteHandler } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return passCheckoutRouteHandler(await getPlatform(), req);
}
