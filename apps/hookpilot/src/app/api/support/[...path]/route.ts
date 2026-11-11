import { getPlatform } from "@/lib/platform";

/** Help search, chat assistant, tickets and operator actions (see @repo/support createSupport().handle). */
type Ctx = { params: Promise<{ path: string[] }> };

async function handler(req: Request, ctx: Ctx): Promise<Response> {
  const p = await getPlatform();
  return p.support.handle(req, (await ctx.params).path ?? []);
}

export const GET = handler;
export const POST = handler;
