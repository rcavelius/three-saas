import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Entitlements } from "@repo/billing";
import type { OrgRole } from "@repo/auth";
import { getPlatform, type Platform } from "./platform";

export interface Viewer {
  p: Platform;
  user: { id: string; email: string; name: string; emailVerified: boolean };
  session: { id: string; activeOrganizationId?: string | null };
  org: { id: string; name: string; slug: string };
  role: OrgRole;
  ents: Entitlements;
}

/** The signed-in user with their active org (membership verified in the DB), or null. */
export async function getViewer(): Promise<Viewer | null> {
  const p = await getPlatform();
  const h = await headers();
  try {
    const r = await p.auth.requireOrg(h);
    const ents = await p.billing.getEntitlements(r.org.id);
    return {
      p,
      user: r.user as Viewer["user"],
      session: r.session as Viewer["session"],
      org: r.org,
      role: r.role,
      ents,
    };
  } catch {
    return null;
  }
}

/** Server components: signed-in viewer or a redirect to /login?next=... */
export async function requireViewer(next: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/login?next=${encodeURIComponent(next)}`);
  return v;
}

export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}
