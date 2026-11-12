import { orgContext } from "@/lib/api";
import { checkDestinationUrl, getDestination, toDestinationDTO } from "@/lib/destinations";
import { apiError, json, notFound, readJsonBody } from "@/lib/http";
import { UUID_RE } from "@/lib/ids";
import { updateDestinationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Rename or change the URL. A new URL clears the verification (re-verify before replaying). */
export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await orgContext(req, { mutating: true, manage: true });
  if (ctx instanceof Response) return ctx;
  if (!UUID_RE.test(id)) return notFound();
  const dest = await getDestination(ctx.ex, ctx.org.id, id);
  if (!dest) return notFound();
  const input = await readJsonBody(req, updateDestinationSchema);
  if (!input.ok) return input.res;
  let url = dest.url;
  if (input.data.url !== undefined) {
    const check = checkDestinationUrl(ctx.p, input.data.url);
    if (!check.ok) return apiError(422, "invalid_destination", check.message, { reason: check.code });
    url = check.url;
  }
  const changed = url !== dest.url;
  try {
    await ctx.ex.query(
      `UPDATE hp_destinations SET name = $3, url = $4, updated_at = now(),
         verified_at = CASE WHEN $5::boolean THEN NULL ELSE verified_at END,
         verification_token_hash = CASE WHEN $5::boolean THEN NULL ELSE verification_token_hash END,
         last_verification_error = CASE WHEN $5::boolean THEN NULL ELSE last_verification_error END
       WHERE org_id = $1 AND id = $2`,
      [ctx.org.id, id, input.data.name ?? dest.name, url, changed],
    );
  } catch (err) {
    if (/hp_destinations_org_url_idx|duplicate key/i.test((err as Error).message)) {
      return apiError(409, "duplicate_destination", "This URL is already a destination.");
    }
    throw err;
  }
  const fresh = await getDestination(ctx.ex, ctx.org.id, id);
  return json({ destination: toDestinationDTO(fresh!) });
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await orgContext(req, { mutating: true, manage: true });
  if (ctx instanceof Response) return ctx;
  if (!UUID_RE.test(id)) return notFound();
  const { rows } = await ctx.ex.query<{ id: string }>(`DELETE FROM hp_destinations WHERE org_id = $1 AND id = $2 RETURNING id`, [ctx.org.id, id]);
  return rows[0] ? json({ deleted: true }) : notFound();
}
