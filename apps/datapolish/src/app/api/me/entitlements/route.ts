import { getPlatform } from "@/server/platform";
import { entitlementsRoute } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return entitlementsRoute(await getPlatform(), req);
}
