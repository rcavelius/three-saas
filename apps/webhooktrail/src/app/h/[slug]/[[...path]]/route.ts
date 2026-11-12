import { handleCapture } from "@/lib/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; path?: string[] }> };

async function capture(req: Request, ctx: Ctx): Promise<Response> {
  const { slug } = await ctx.params;
  return handleCapture(req, slug);
}

export const GET = capture;
export const POST = capture;
export const PUT = capture;
export const PATCH = capture;
export const DELETE = capture;
export const HEAD = capture;
export const OPTIONS = capture;
