import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { AcceptInvitation } from "@/components/auth/AcceptInvitation";
import { Notice, PageTitle, primaryButton, secondaryButton } from "@/components/ui";
import { getPlatform } from "@/lib/platform";

export const metadata: Metadata = { title: "Workspace invitation", robots: { index: false }, referrer: "no-referrer" };

export default async function AcceptInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPlatform();
  const session = await p.auth.getSession(await headers());
  const { rows } = /^[0-9a-f-]{36}$/i.test(id)
    ? await p.handle.executor.query<{ organization_id: string; email: string; role: string; status: string; expires_at: string; org_name: string }>(
        `SELECT i.organization_id, i.email, i.role, i.status, i.expires_at, o.name AS org_name
         FROM auth_invitation i JOIN auth_organization o ON o.id = i.organization_id WHERE i.id = $1`,
        [id],
      )
    : { rows: [] };
  const inv = rows[0];
  const valid = inv && inv.status === "pending" && new Date(inv.expires_at).getTime() > p.now().getTime();
  // Only reveal invitation details to its recipient (or before sign-in, the workspace name only).
  const forViewer = !session || (inv && session.user.email.toLowerCase() === inv.email.toLowerCase());
  const next = `/accept-invitation/${id}`;

  return (
    <div className="mx-auto max-w-xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle eyebrow="Team" title={valid && forViewer ? `Join ${inv.org_name}` : "Workspace invitation"} />
      <div className="mt-8 space-y-6">
        {!valid ? (
          <Notice tone="error" role="alert">
            This invitation is no longer valid. It may have expired, been cancelled or already been used. Ask the person who invited you to send a new one.
          </Notice>
        ) : !session ? (
          <>
            <p className="text-ink-soft">
              You were invited to the <strong>{inv.org_name}</strong> workspace on SiteProof. Log in, or create an account with the invited email address, to accept.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className={primaryButton} href={`/login?next=${encodeURIComponent(next)}`}>
                Log in
              </Link>
              <Link className={secondaryButton} href={`/signup`}>
                Create an account
              </Link>
            </div>
            <p className="text-sm text-muted">After confirming a new account, open the invitation link from your email again.</p>
          </>
        ) : !forViewer ? (
          <Notice tone="warn" role="alert">
            This invitation was sent to a different email address. Sign in with the invited address to accept it.
          </Notice>
        ) : (
          <>
            <p className="text-ink-soft">
              You will join <strong>{inv.org_name}</strong> as <strong>{inv.role}</strong> and see its monitored sites and reports.
            </p>
            <AcceptInvitation invitationId={id} organizationId={inv.organization_id} />
          </>
        )}
      </div>
    </div>
  );
}
