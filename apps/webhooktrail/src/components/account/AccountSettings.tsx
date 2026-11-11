"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";

type Msg = { ok: boolean; text: string } | null;

function Status({ msg }: { msg: Msg }) {
  return (
    <p aria-live="polite" className={`text-[12.5px] min-h-[1.25rem] ${msg?.ok ? "text-ok" : "text-err"}`}>
      {msg?.text}
    </p>
  );
}

interface SessionRow {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string | Date;
  expiresAt: string | Date;
}

export function AccountSettings({ name: initialName, email, currentSessionId, ownsSoleWorkspaces }: {
  name: string;
  email: string;
  currentSessionId: string;
  ownsSoleWorkspaces: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [nameMsg, setNameMsg] = useState<Msg>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [delPw, setDelPw] = useState("");
  const [delConfirm, setDelConfirm] = useState(false);
  const [delMsg, setDelMsg] = useState<Msg>(null);

  const loadSessions = useCallback(async () => {
    const r = await authClient().listSessions();
    setSessions((r.data as SessionRow[] | null) ?? []);
  }, []);
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  return (
    <div className="grid gap-10">
      <section aria-labelledby="a-profile">
        <h2 id="a-profile" className="text-[16px] font-semibold">
          Profile
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          Email: <span className="font-mono text-fg">{email}</span>
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2 items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await authClient().updateUser({ name });
            setNameMsg(r.error ? { ok: false, text: authErrorMessage(r.error, "Could not save.") } : { ok: true, text: "Saved." });
            router.refresh();
          }}
        >
          <label className="grid gap-1 text-[13px]">
            <span className="text-fg-muted">Name</span>
            <input className="field h-9" value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <button className="btn h-9">Save</button>
        </form>
        <Status msg={nameMsg} />
      </section>

      <section aria-labelledby="a-pw">
        <h2 id="a-pw" className="text-[16px] font-semibold">
          Change password
        </h2>
        <form
          className="mt-3 grid gap-2 max-w-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await authClient().changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
            if (r.error) setPwMsg({ ok: false, text: authErrorMessage(r.error, "Could not change the password.") });
            else {
              setPwMsg({ ok: true, text: "Password changed. Other sessions were signed out." });
              setCur("");
              setNext("");
              void loadSessions();
            }
          }}
        >
          <label className="grid gap-1 text-[13px]">
            <span className="text-fg-muted">Current password</span>
            <input className="field h-9" type="password" value={cur} required autoComplete="current-password" onChange={(e) => setCur(e.target.value)} />
          </label>
          <label className="grid gap-1 text-[13px]">
            <span className="text-fg-muted">New password (at least 10 characters)</span>
            <input
              className="field h-9"
              type="password"
              value={next}
              minLength={10}
              required
              autoComplete="new-password"
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <button className="btn h-9 w-fit">Change password</button>
        </form>
        <Status msg={pwMsg} />
      </section>

      <section aria-labelledby="a-sessions">
        <h2 id="a-sessions" className="text-[16px] font-semibold">
          Sessions
        </h2>
        {sessions === null ? (
          <p className="mt-2 font-mono text-[12px] text-fg-dim">Loading…</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border border-line rounded-[6px]">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[12.5px]">
                <span className="font-mono text-fg-muted truncate max-w-[22rem]">{s.userAgent || "Unknown device"}</span>
                <span className="font-mono text-fg-dim">{s.ipAddress || ""}</span>
                <span className="text-fg-dim">since {new Date(s.createdAt).toLocaleDateString()}</span>
                {s.id === currentSessionId ? (
                  <span className="ml-auto text-ok">this session</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost h-7 ml-auto"
                    onClick={async () => {
                      await authClient().revokeSession({ token: s.token });
                      void loadSessions();
                    }}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="btn mt-3"
          onClick={async () => {
            await authClient().revokeOtherSessions();
            void loadSessions();
          }}
        >
          Sign out all other sessions
        </button>
      </section>

      <section aria-labelledby="a-delete" className="border border-err/30 rounded-[6px] p-4">
        <h2 id="a-delete" className="text-[16px] font-semibold text-err">
          Delete account
        </h2>
        <div className="mt-2 text-[13px] text-fg-muted grid gap-2">
          <p>Deleting your account is immediate and cannot be undone. It deletes:</p>
          <ul className="list-disc pl-5 grid gap-1">
            <li>your login, sessions and memberships;</li>
            <li>
              {ownsSoleWorkspaces.length > 0
                ? `the workspace${ownsSoleWorkspaces.length === 1 ? "" : "s"} you alone own (${ownsSoleWorkspaces.join(", ")}): every endpoint, captured request, replay destination and replay log in them;`
                : "no workspaces (you are not the only owner of any);"}
            </li>
            <li>any active subscription of those workspaces, which is canceled at once without a refund for the rest of the period.</li>
          </ul>
          <p>Invoices and payment records stay with our payment provider (Stripe) as required for accounting.</p>
        </div>
        {!delConfirm ? (
          <button type="button" className="btn btn-danger mt-3" onClick={() => setDelConfirm(true)}>
            Delete my account…
          </button>
        ) : (
          <form
            className="mt-3 flex flex-wrap gap-2 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await authClient().deleteUser({ password: delPw });
              if (r.error) return setDelMsg({ ok: false, text: authErrorMessage(r.error, "Could not delete the account.") });
              router.push("/");
              router.refresh();
            }}
          >
            <label className="grid gap-1 text-[13px]">
              <span className="text-fg-muted">Confirm with your password</span>
              <input className="field h-9" type="password" value={delPw} required autoComplete="current-password" onChange={(e) => setDelPw(e.target.value)} />
            </label>
            <button className="btn btn-danger h-9">Delete everything permanently</button>
            <button type="button" className="btn h-9" onClick={() => setDelConfirm(false)}>
              Cancel
            </button>
          </form>
        )}
        <Status msg={delMsg} />
      </section>
    </div>
  );
}
