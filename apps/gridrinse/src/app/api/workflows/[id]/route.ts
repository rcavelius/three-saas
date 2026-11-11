import { getPlatform } from "@/server/platform";
import { deleteWorkflowRoute, getWorkflowRoute, updateWorkflowRoute } from "@/server/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return getWorkflowRoute(await getPlatform(), req, (await ctx.params).id);
}

export async function PUT(req: Request, ctx: Ctx) {
  return updateWorkflowRoute(await getPlatform(), req, (await ctx.params).id);
}

export async function DELETE(req: Request, ctx: Ctx) {
  return deleteWorkflowRoute(await getPlatform(), req, (await ctx.params).id);
}
