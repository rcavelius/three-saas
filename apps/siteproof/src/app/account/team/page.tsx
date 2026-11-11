import type { Metadata } from "next";
import { AccountNav } from "@/components/account/AccountNav";
import { TeamManager } from "@/components/account/TeamManager";
import { PageTitle } from "@/components/ui";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

export default async function TeamPage() {
  const v = await requireViewer("/account/team");
  const ex = v.p.handle.executor;
  const { rows: members } = await ex.query<{ id: string; user_id: string; name: string; email: string; role: string }>(
    `SELECT m.id, m.user_id, u.name, u.email, m.role FROM auth_member m JOIN auth_user u ON u.id = m.user_id
     WHERE m.organization_id = $1 ORDER BY m.created_at`,
    [v.org.id],
  );
  const { rows: invitations } = await ex.query<{ id: string; email: string; role: string; expires_at: string }>(
    `SELECT id, email, role, expires_at FROM auth_invitation WHERE organization_id = $1 AND status = 'pending' AND expires_at > $2 ORDER BY created_at`,
    [v.org.id, v.p.now().toISOString()],
  );
  const seats = v.ents.limits.teamSeats ?? 1;
  return (
    <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
      <PageTitle
        eyebrow={v.org.name}
        title="Team"
        lede={`${members.length} of ${seats === -1 ? "unlimited" : seats} seat${seats === 1 ? "" : "s"} used on the ${v.ents.planName} plan. Members see every monitored site and report of this workspace; admins and owners can change sites and invite people; only owners manage billing.`}
      />
      <AccountNav current="/account/team" />
      <div className="mt-8">
        <TeamManager
          orgId={v.org.id}
          canManage={v.role === "owner" || v.role === "admin"}
          isOwner={v.role === "owner"}
          currentUserId={v.user.id}
          members={members.map((m) => ({ id: m.id, userId: m.user_id, name: m.name, email: m.email, role: m.role }))}
          invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: new Date(i.expires_at).toISOString() }))}
          seatsLimit={seats}
        />
      </div>
    </div>
  );
}
