import { getPlatform } from "@/server/platform";
import { adminActionRoute } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return adminActionRoute(await getPlatform(), req);
}
