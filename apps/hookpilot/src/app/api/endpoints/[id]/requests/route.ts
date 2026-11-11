import { ownedEndpointContext } from "@/lib/api";
import { apiError, json } from "@/lib/http";
import { clearRequests, listRequests } from "@/lib/requests";
import { listRequestsQuerySchema, searchParamsToObject } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** ?method=&q=&from=&to=&before=<cursor>|after=<cursor>&limit= */
export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: false });
  if (ctx instanceof Response) return ctx;
  const parsed = listRequestsQuerySchema.safeParse(searchParamsToObject(new URL(req.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "validation_failed", "Invalid query.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return json(await listRequests(ctx.ex, ctx.endpoint.id, parsed.data));
}

/** Clear all captured requests. */
export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await ownedEndpointContext(req, id, { mutating: true, allowExpired: true });
  if (ctx instanceof Response) return ctx;
  return json({ deleted: await clearRequests(ctx.ex, ctx.endpoint.id) });
}
