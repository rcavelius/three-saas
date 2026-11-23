/**
 * What the person making a request may see and do: their signed-in org's plan (if any) plus a one-time pass
 * from the signed pass cookie (anonymous or signed in). No next/* imports, so route handlers and tests share it.
 */
import type { Entitlements } from "@repo/billing";
import type { Platform } from "./platform";

export interface VisitorAccess {
  ents: Entitlements;
  /** Signed-in active org, or null for anonymous visitors. */
  orgId: string | null;
}

/** Verified pass session ids from the request's Cookie header ([] when absent, forged or not configured). */
export function passIdsOf(p: Platform, headers: Headers): string[] {
  return p.billing.passIdsFromCookieHeader(headers.get("cookie"));
}

/** Entitlements of a known org (membership already checked by the caller) plus the visitor's pass cookie. */
export async function orgEntitlements(p: Platform, headers: Headers, orgId: string): Promise<Entitlements> {
  return p.billing.getEntitlements(orgId, { passIds: passIdsOf(p, headers) });
}

/** Signed-in org plan (when signed in) + pass cookie; anonymous visitors get the free plan + their pass. */
export async function visitorAccess(p: Platform, headers: Headers): Promise<VisitorAccess> {
  let orgId: string | null = null;
  try {
    if (headers.get("cookie")) orgId = (await p.auth.requireOrg(headers)).org.id;
  } catch {
    orgId = null;
  }
  const ents = await p.billing.getEntitlements(orgId, { passIds: passIdsOf(p, headers) });
  return { ents, orgId };
}
