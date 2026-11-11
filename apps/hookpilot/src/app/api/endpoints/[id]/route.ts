import { ownedEndpointContext } from "@/lib/api";
import { deleteEndpoint, getOwnedEndpoint, toEndpointDTO, updateEndpoint } from "@/lib/endpoints";
import { appOrigin, json, notFound, readJsonBody } from "@/lib/http";
import { updateEndpointSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: false, allowExpired: true });
  if (ctx instanceof Response) return ctx;
  return json({ endpoint: toEndpointDTO(ctx.endpoint, appOrigin(req)) });
}

/** Rename, change expiry, set or reset the custom response. */
export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: true });
  if (ctx instanceof Response) return ctx;
  const input = await readJsonBody(req, updateEndpointSchema);
  if (!input.ok) return input.res;
  await updateEndpoint(ctx.ex, ctx.endpoint, input.data);
  const fresh = await getOwnedEndpoint(ctx.ex, ctx.owner, id);
  if (!fresh) return notFound();
  return json({ endpoint: toEndpointDTO(fresh, appOrigin(req)) });
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: true, allowExpired: true });
  if (ctx instanceof Response) return ctx;
  await deleteEndpoint(ctx.ex, ctx.endpoint.id);
  return json({ deleted: true });
}
