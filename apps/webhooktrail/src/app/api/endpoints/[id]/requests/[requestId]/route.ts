import { ownedEndpointContext } from "@/lib/api";
import { json, notFound } from "@/lib/http";
import { UUID_RE } from "@/lib/ids";
import { deleteRequest, getRequest } from "@/lib/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; requestId: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { id, requestId } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: false });
  if (ctx instanceof Response) return ctx;
  if (!UUID_RE.test(requestId)) return notFound();
  const detail = await getRequest(ctx.ex, ctx.endpoint.id, requestId);
  return detail ? json({ request: detail }) : notFound();
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  const { id, requestId } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: true, allowExpired: true });
  if (ctx instanceof Response) return ctx;
  if (!UUID_RE.test(requestId)) return notFound();
  return (await deleteRequest(ctx.ex, ctx.endpoint.id, requestId)) ? json({ deleted: true }) : notFound();
}
