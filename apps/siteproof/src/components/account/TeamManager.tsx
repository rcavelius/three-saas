"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, errorMessage } from "@/lib/client/auth-client";
import { Field, Notice, inputClass, primaryButton, secondaryButton } from "@/components/ui";

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}
interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export function TeamManager(props: {
  orgId: string;
  canManage: boolean;
  isOwner: boolean;
  currentUserId: string;
  members: Member[];
  invitations: Invitation[];
  seatsLimit: number;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seatsUsed = props.members.length + props.invitations.length;
  const full = props.seatsLimit !== -1 && seatsUsed >= props.seatsLimit;

  async function run(fn: () => Promise<{ error: { message?: string; status?: number } | null }>, ok: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    setMsg(error ? { tone: "error", text: errorMessage(error, "That did not work.") } : { tone: "ok", text: ok });
    if (!error) router.refresh();
  }

  return (
    <div className="space-y-8">
      {msg && (
        <Notice tone={msg.tone} role="status">
          {msg.text}
        </Notice>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-[0.95rem]">
          <caption className="sr-only">Members</caption>
          <thead className="border-b border-ink">
            <tr>
              <th scope="col" className="py-2 pr-4 font-semibold">Member</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Role</th>
              <th scope="col" className="py-2 font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {props.members.map((m) => (
              <tr key={m.id}>
                <td className="py-3 pr-4">
                  <span className="font-medium">{m.name || m.email}</span>
                  <span className="num block text-sm text-muted">{m.email}</span>
                </td>
                <td className="py-3 pr-4">
                  {props.isOwner && m.userId !== props.currentUserId ? (
                    <select
                      aria-label={`Role of ${m.email}`}
                      className={`${inputClass} !min-h-9 !w-auto`}
                      defaultValue={m.role}
                      disabled={busy}
                      onChange={(e) =>
                        run(() => authClient().organization.updateMemberRole({ memberId: m.id, role: e.target.value as "member" | "admin" | "owner", organizationId: props.orgId }), "Role updated.")
                      }
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                      <option value="owner">owner</option>
                    </select>
                  ) : (
                    m.role
                  )}
                </td>
                <td className="py-3 text-right">
                  {props.canManage && m.userId !== props.currentUserId && (
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() => run(() => authClient().organization.removeMember({ memberIdOrEmail: m.id, organizationId: props.orgId }), "Member removed.")}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {props.invitations.map((i) => (
              <tr key={i.id}>
                <td className="py-3 pr-4">
                  <span className="num">{i.email}</span>
                  <span className="block text-sm text-muted">Invitation pending</span>
                </td>
                <td className="py-3 pr-4">{i.role}</td>
                <td className="py-3 text-right">
                  {props.canManage && (
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() => run(() => authClient().organization.cancelInvitation({ invitationId: i.id }), "Invitation cancelled.")}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {props.canManage && (
        <section aria-labelledby="invite">
          <h2 id="invite" className="font-display text-2xl font-semibold">
            Invite someone
          </h2>
          {full ? (
            <div className="mt-4">
              <Notice tone="warn">
                All {props.seatsLimit} seat{props.seatsLimit === 1 ? " is" : "s are"} in use on your plan.{" "}
                <a className="text-accent underline" href="/account/billing">
                  Upgrade to Agency
                </a>{" "}
                for 5 seats.
              </Notice>
            </div>
          ) : (
            <form
              className="mt-4 grid max-w-xl gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                const email = String(f.get("email") ?? "").trim();
                const role = String(f.get("role") ?? "member") as "member" | "admin";
                void run(() => authClient().organization.inviteMember({ email, role, organizationId: props.orgId }), `Invitation sent to ${email}.`).then(() => form.reset());
              }}
            >
              <Field id="invite-email" name="email" type="email" label="Email" required autoComplete="off" />
              <div>
                <label htmlFor="invite-role" className="block text-sm font-medium">
                  Role
                </label>
                <select id="invite-role" name="role" className={`mt-1 ${inputClass}`} defaultValue="member">
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <button type="submit" className={primaryButton} disabled={busy}>
                Send invitation
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
