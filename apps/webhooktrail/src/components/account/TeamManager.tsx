"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";

interface Member {
  id: string;
  role: string;
  userId: string;
  user: { name: string; email: string };
}
interface Invitation {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string | Date;
}

export function TeamManager({ orgId, seats, canManage, myUserId }: { orgId: string; seats: number; canManage: boolean; myUserId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await authClient().organization.getFullOrganization({ query: { organizationId: orgId } });
    const d = r.data as { members?: Member[]; invitations?: Invitation[] } | null;
    setMembers(d?.members ?? []);
    setInvites((d?.invitations ?? []).filter((i) => i.status === "pending"));
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  const used = (members?.length ?? 0) + invites.length;
  const full = seats >= 0 && used >= seats;

  return (
    <div className="grid gap-8">
      <p className="text-[13px] text-fg-muted">
        Seats: <span className="font-mono text-fg">{used}</span> of <span className="font-mono text-fg">{seats < 0 ? "unlimited" : seats}</span> used
        (members plus pending invitations). Every member sees all of the workspace&apos;s endpoints and captured requests; only owners and admins
        can delete endpoints, manage replay destinations and the team.
      </p>

      <section aria-labelledby="t-members">
        <h2 id="t-members" className="text-[16px] font-semibold">
          Members
        </h2>
        {members === null ? (
          <p className="mt-2 font-mono text-[12px] text-fg-dim">Loading…</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border border-line rounded-[14px]">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]">
                <span className="font-medium">{m.user.name}</span>
                <span className="font-mono text-[12px] text-fg-muted">{m.user.email}</span>
                <span className="ml-auto font-mono text-[12px]">{m.role}</span>
                {canManage && m.userId !== myUserId && !m.role.includes("owner") && (
                  <>
                    <label className="sr-only" htmlFor={`role-${m.id}`}>
                      Role of {m.user.email}
                    </label>
                    <select
                      id={`role-${m.id}`}
                      className="field h-7"
                      value={m.role}
                      onChange={async (e) => {
                        const r = await authClient().organization.updateMemberRole({ memberId: m.id, role: e.target.value as "member" | "admin", organizationId: orgId });
                        setMsg(r.error ? { ok: false, text: authErrorMessage(r.error, "Could not change the role.") } : { ok: true, text: "Role updated." });
                        void load();
                      }}
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-danger h-7"
                      onClick={async () => {
                        const r = await authClient().organization.removeMember({ memberIdOrEmail: m.id, organizationId: orgId });
                        setMsg(r.error ? { ok: false, text: authErrorMessage(r.error, "Could not remove.") } : { ok: true, text: "Member removed." });
                        void load();
                      }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {invites.length > 0 && (
        <section aria-labelledby="t-invites">
          <h2 id="t-invites" className="text-[16px] font-semibold">
            Pending invitations
          </h2>
          <ul className="mt-3 divide-y divide-line border border-line rounded-[14px]">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[13px]">
                <span className="font-mono text-[12px]">{i.email}</span>
                <span className="text-fg-dim">{i.role}</span>
                <span className="text-fg-dim">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-ghost h-7 ml-auto"
                    onClick={async () => {
                      await authClient().organization.cancelInvitation({ invitationId: i.id });
                      void load();
                    }}
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage && (
        <section aria-labelledby="t-invite">
          <h2 id="t-invite" className="text-[16px] font-semibold">
            Invite someone
          </h2>
          {full ? (
            <p className="mt-2 text-[13px] text-fg-muted">
              All seats are used. <a className="text-signal underline underline-offset-2" href="/account/billing">The Pro plan</a> includes team
              seats.
            </p>
          ) : (
            <form
              className="mt-3 flex flex-wrap gap-2 items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await authClient().organization.inviteMember({ email, role, organizationId: orgId });
                if (r.error) {
                  setMsg({
                    ok: false,
                    text: r.error.status === 403 ? "No free seat on your plan, or you lack permission." : authErrorMessage(r.error, "Could not invite."),
                  });
                } else {
                  setMsg({ ok: true, text: `Invitation sent to ${email}.` });
                  setEmail("");
                }
                void load();
              }}
            >
              <label className="grid gap-1 text-[13px]">
                <span className="text-fg-muted">Email</span>
                <input className="field h-9" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="grid gap-1 text-[13px]">
                <span className="text-fg-muted">Role</span>
                <select className="field h-9" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <button className="btn btn-signal h-9">Send invitation</button>
            </form>
          )}
        </section>
      )}
      <p aria-live="polite" className={`text-[12.5px] min-h-[1.25rem] ${msg?.ok ? "text-ok" : "text-err"}`}>
        {msg?.text}
      </p>
    </div>
  );
}
