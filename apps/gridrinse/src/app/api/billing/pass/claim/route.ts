import { getPlatform } from "@/server/platform";
import { passClaimRouteHandler } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return passClaimRouteHandler(await getPlatform(), req);
}
