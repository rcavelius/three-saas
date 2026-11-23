import { ownedEndpointContext } from "@/lib/api";
import { deleteEndpoint, getVisibleEndpoint, toEndpointDTO, updateEndpoint } from "@/lib/endpoints";
import { json, notFound, readJsonBody } from "@/lib/http";
import { viewerPassInfo } from "@/lib/pass";
import { updateEndpointSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: false, allowExpired: true });
  if (ctx instanceof Response) return ctx;
  return json({
    endpoint: toEndpointDTO(ctx.endpoint, ctx.p.appUrl, ctx.limits, ctx.viewer),
    signedIn: Boolean(ctx.viewer.user),
    pass: await viewerPassInfo(ctx.p, ctx.viewer),
  });
}

/** Rename, change expiry (expiring endpoints only), set or reset the custom response. */
export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: true });
  if (ctx instanceof Response) return ctx;
  const input = await readJsonBody(req, updateEndpointSchema);
  if (!input.ok) return input.res;
  await updateEndpoint(ctx.ex, ctx.endpoint, input.data);
  const fresh = await getVisibleEndpoint(ctx.ex, ctx.viewer, id);
  if (!fresh) return notFound();
  return json({ endpoint: toEndpointDTO(fresh, ctx.p.appUrl, ctx.limits, ctx.viewer) });
}

/** Only owners/admins may delete workspace endpoints (members get 403). */
export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: true, allowExpired: true, manage: true });
  if (ctx instanceof Response) return ctx;
  await deleteEndpoint(ctx.ex, ctx.endpoint.id);
  return json({ deleted: true });
}
