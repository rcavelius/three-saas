import { orgContext } from "@/lib/api";
import { checkDestinationUrl, listDestinations, toDestinationDTO, type DestinationRow } from "@/lib/destinations";
import { apiError, json, readJsonBody } from "@/lib/http";
import { orgLimits } from "@/lib/org-data";
import { limits } from "@/lib/plans";
import { createDestinationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every member can list the workspace's destinations (and replay to verified ones). */
export async function GET(req: Request): Promise<Response> {
  const ctx = await orgContext(req, { mutating: false });
  if (ctx instanceof Response) return ctx;
  return json({ destinations: (await listDestinations(ctx.ex, ctx.org.id)).map(toDestinationDTO) });
}

/** Owners/admins add a destination (unverified until the challenge round-trip succeeds). */
export async function POST(req: Request): Promise<Response> {
  const ctx = await orgContext(req, { mutating: true, manage: true });
  if (ctx instanceof Response) return ctx;
  const input = await readJsonBody(req, createDestinationSchema);
  if (!input.ok) return input.res;
  const lim = await orgLimits(ctx.p, ctx.org.id);
  if (!lim.replay) return apiError(403, "plan_required", "Replay destinations are available on the Developer and Pro plans.");
  const check = checkDestinationUrl(ctx.p, input.data.url);
  if (!check.ok) return apiError(422, "invalid_destination", check.message, { reason: check.code });
  const { rows: c } = await ctx.ex.query<{ n: number }>(`SELECT count(*)::int AS n FROM hp_destinations WHERE org_id = $1`, [ctx.org.id]);
  if (Number(c[0]?.n ?? 0) >= limits.destinationsPerOrg) {
    return apiError(403, "destination_limit", `At most ${limits.destinationsPerOrg} destinations per workspace.`);
  }
  const { rows } = await ctx.ex.query<DestinationRow>(
    `INSERT INTO hp_destinations (org_id, name, url, created_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, url) DO NOTHING
     RETURNING id, org_id, name, url, verified_at, verification_attempted_at, last_verification_error, created_at`,
    [ctx.org.id, input.data.name, check.url, ctx.user.id],
  );
  if (!rows[0]) return apiError(409, "duplicate_destination", "This URL is already a destination.");
  return json({ destination: toDestinationDTO(rows[0]) }, { status: 201 });
}
