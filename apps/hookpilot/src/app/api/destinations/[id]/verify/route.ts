import { rateLimit } from "@repo/database";
import { orgContext } from "@/lib/api";
import { getDestination, toDestinationDTO, verifyDestination } from "@/lib/destinations";
import { apiError, json, notFound, tooManyRequests } from "@/lib/http";
import { UUID_RE } from "@/lib/ids";
import { orgLimits } from "@/lib/org-data";
import { limits } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Runs the challenge round-trip now (owners/admins; rate limited per workspace and destination). */
export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const ctx = await orgContext(req, { mutating: true, manage: true });
  if (ctx instanceof Response) return ctx;
  if (!UUID_RE.test(id)) return notFound();
  const dest = await getDestination(ctx.ex, ctx.org.id, id);
  if (!dest) return notFound();
  if (!(await orgLimits(ctx.p, ctx.org.id)).replay) {
    return apiError(403, "plan_required", "Replay destinations are available on the Developer and Pro plans.");
  }
  const orgRl = await rateLimit(ctx.ex, `hp:verify:org:${ctx.org.id}`, limits.verifyPerOrgPerMinute, 60_000);
  if (!orgRl.allowed) return tooManyRequests(orgRl.resetAt, "Too many verification attempts. Try again shortly.");
  const destRl = await rateLimit(ctx.ex, `hp:verify:dest:${dest.id}`, limits.verifyPerDestinationPerMinute, 60_000);
  if (!destRl.allowed) return tooManyRequests(destRl.resetAt, "Too many verification attempts for this destination.");
  const outcome = await verifyDestination(ctx.p, dest);
  const fresh = await getDestination(ctx.ex, ctx.org.id, id);
  return json({ verified: outcome.verified, error: outcome.error, destination: fresh ? toDestinationDTO(fresh) : null });
}
