import { orgContext } from "@/lib/api";
import { claimAnonEndpoints } from "@/lib/endpoints";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Claim my anonymous endpoints": moves the unclaimed endpoints of THIS browser's owner cookie into
 * the signed-in workspace (only those whose owner-token hash matches the cookie), up to the plan's
 * endpoint limit. Endpoint ids in the body are not accepted: the cookie is the proof of ownership.
 */
export async function POST(req: Request): Promise<Response> {
  const ctx = await orgContext(req, { mutating: true });
  if (ctx instanceof Response) return ctx;
  if (!ctx.viewer.anonHash) return apiError(400, "nothing_to_claim", "This browser has no anonymous endpoints.");
  const r = await claimAnonEndpoints(ctx.p, ctx.org.id, ctx.user.id, ctx.viewer.anonHash);
  return json({ claimed: r.claimed.length, skipped: r.skipped.length, claimedIds: r.claimed });
}
