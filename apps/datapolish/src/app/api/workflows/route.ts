import { getPlatform } from "@/server/platform";
import { createWorkflowRoute, listWorkflowsRoute } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return listWorkflowsRoute(await getPlatform(), req);
}

export async function POST(req: Request) {
  return createWorkflowRoute(await getPlatform(), req);
}
