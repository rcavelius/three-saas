import { getPlatform } from "@/server/platform";
import { authRoute } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return authRoute(await getPlatform(), req);
}

export async function POST(req: Request) {
  return authRoute(await getPlatform(), req);
}
