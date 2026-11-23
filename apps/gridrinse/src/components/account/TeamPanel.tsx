"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { track } from "@/lib/analytics";
import { authClient, authErrorMessage } from "@/lib/authClient";

interface Member {
  id: string;
  role: string;
  userId: string;
  user: { name: string; email: string };
}
interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
}

export function TeamPanel({
  orgId,
  orgName,
  myRole,
  myUserId,
  seats,
  planName,
}: {
  orgId: string;
  orgName: string;
  myRole: "owner" | "admin" | "member";
  myUserId: string;
  seats: number;
  planName: string;
}) {
  const c = authClient();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [msg, setMsg] = useState<{ t: string; e?: boolean } | null>(null);
  const emailId = useId();
  const roleId = useId();
  const canManage = myRole === "owner" || myRole === "admin";

  const load = useCallback(async () => {
    const { data } = await c.organization.getFullOrganization({ query: { organizationId: orgId } });
    const d = data as { members?: Member[]; invitations?: Invitation[] } | null;
    setMembers(d?.members ?? []);
    setInvites((d?.invitations ?? []).filter((i) => i.status === "pending"));
  }, [c, orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  const unlimited = seats < 0;
  const used = members.length + invites.length;
  const full = !unlimited && used >= seats;
  const over = !unlimited && members.length > seats;

  return (
    <div className="mt-6 grid gap-5">
      <section className="panel px-5 py-5">
        <h2 className="text-base font-semibold">{orgName}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {members.length} member{members.length === 1 ? "" : "s"}
          {invites.length ? `, ${invites.length} pending invitation${invites.length === 1 ? "" : "s"}` : ""} · {unlimited ? "unlimited seats" : `${seats} seat${seats === 1 ? "" : "s"} on ${planName}`}
        </p>
        {over && (
          <p role="alert" className="mt-2 border-l-2 border-del-ink bg-del px-3 py-2 text-sm text-del-ink">
            Your plan includes {seats} seat{seats === 1 ? "" : "s"} but the team has {members.length} members. Nobody was removed; new invitations are blocked until you remove members or upgrade.
          </p>
        )}
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-medium">{m.user.name || m.user.email}</span>
                <span className="block text-[12px] text-ink-3">
                  {m.user.email} · {m.role}
                  {m.userId === myUserId ? " · you" : ""}
                </span>
              </span>
              {canManage && m.userId !== myUserId && !m.role.includes("owner") && (
                <span className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      const { error } = await c.organization.updateMemberRole({ memberId: m.id, role: m.role === "admin" ? "member" : "admin", organizationId: orgId });
                      setMsg(error ? { t: authErrorMessage(error), e: true } : { t: "Role updated." });
                      void load();
                    }}
                  >
                    Make {m.role === "admin" ? "member" : "admin"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      const { error } = await c.organization.removeMember({ memberIdOrEmail: m.id, organizationId: orgId });
                      setMsg(error ? { t: authErrorMessage(error), e: true } : { t: `Removed ${m.user.email}.` });
                      void load();
                    }}
                  >
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-medium">{i.email}</span>
                <span className="block text-[12px] text-ink-3">invited · {i.role}</span>
              </span>
              {canManage && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    await c.organization.cancelInvitation({ invitationId: i.id });
                    void load();
                  }}
                >
                  Cancel invitation
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section className="panel px-5 py-5">
          <h2 className="text-base font-semibold">Invite a teammate</h2>
          {full ? (
            <p className="mt-2 text-sm text-ink-2">
              {seats <= 1 ? "Team members are part of the Business plan." : `All ${seats} seats are in use.`}{" "}
              <Link href="/account/billing" className="text-accent underline" onClick={() => track("upgrade_clicked", { from: "team", plan: "business" })}>
                See billing
              </Link>
            </p>
          ) : (
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const { error } = await c.organization.inviteMember({ email: email.trim(), role, organizationId: orgId });
                if (error) setMsg({ t: authErrorMessage(error, "Could not send the invitation."), e: true });
                else {
                  setMsg({ t: `Invitation sent to ${email.trim()}.` });
                  setEmail("");
                }
                void load();
              }}
            >
              <div className="min-w-[220px] flex-1">
                <label htmlFor={emailId} className="label">
                  Email
                </label>
                <input id={emailId} type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label htmlFor={roleId} className="label">
                  Role
                </label>
                <select id={roleId} className="field" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary">
                Send invitation
              </button>
            </form>
          )}
        </section>
      )}
      {msg && (
        <p role={msg.e ? "alert" : "status"} className={`text-sm ${msg.e ? "text-del-ink" : "text-ink-2"}`}>
          {msg.t}
        </p>
      )}
    </div>
  );
}
