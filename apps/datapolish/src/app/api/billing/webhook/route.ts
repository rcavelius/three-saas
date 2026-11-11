import { getPlatform } from "@/server/platform";
import { webhookRouteHandler } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return webhookRouteHandler(await getPlatform(), req);
}
