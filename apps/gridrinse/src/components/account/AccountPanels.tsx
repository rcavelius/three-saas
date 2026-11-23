"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { authClient, authErrorMessage } from "@/lib/authClient";

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "danger" }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`panel px-5 py-5 ${tone === "danger" ? "bg-del" : ""}`}>
      <h2 id={id} className="text-[19px] font-extrabold tracking-[-0.01em]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Note({ msg, error }: { msg: string | null; error?: boolean }) {
  if (!msg) return null;
  return (
    <p role={error ? "alert" : "status"} className={`mt-2 text-sm ${error ? "text-del-ink" : "text-ink-2"}`}>
      {msg}
    </p>
  );
}

interface SessionRow {
  id: string;
  token: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function describeAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** The current session is identified by id: the session token itself is never put into the page. */
export function AccountPanels({ user, currentSessionId }: { user: { name: string; email: string }; currentSessionId: string }) {
  const c = authClient();
  const [name, setName] = useState(user.name);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState<{ t: string; e?: boolean } | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessMsg, setSessMsg] = useState<string | null>(null);
  const [delPw, setDelPw] = useState("");
  const [delConfirm, setDelConfirm] = useState(false);
  const [delMsg, setDelMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { name: useId(), cur: useId(), next: useId(), del: useId() };

  const loadSessions = useCallback(async () => {
    const { data } = await c.listSessions();
    setSessions((data as SessionRow[] | null) ?? []);
  }, [c]);
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  return (
    <div className="mt-6 grid gap-5">
      <Section title="Profile">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await c.updateUser({ name: name.trim() });
            setProfileMsg(error ? authErrorMessage(error) : "Saved.");
          }}
        >
          <div className="min-w-[220px] flex-1">
            <label htmlFor={ids.name} className="label">
              Name
            </label>
            <input id={ids.name} className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
          </div>
          <button type="submit" className="btn">
            Save
          </button>
        </form>
        <p className="mt-2 text-sm text-ink-2">Email: {user.email}</p>
        <Note msg={profileMsg} />
      </Section>

      <Section title="Change password">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await c.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
            if (error) setPwMsg({ t: error.status === 400 || error.status === 401 ? "Current password is incorrect, or the new one is too short." : authErrorMessage(error), e: true });
            else {
              setPwMsg({ t: "Password changed. Other devices were signed out." });
              setCur("");
              setNext("");
              void loadSessions();
            }
          }}
        >
          <div>
            <label htmlFor={ids.cur} className="label">
              Current password
            </label>
            <input id={ids.cur} type="password" className="field" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required />
          </div>
          <div>
            <label htmlFor={ids.next} className="label">
              New password (10+ characters)
            </label>
            <input id={ids.next} type="password" className="field" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn">
              Change password
            </button>
          </div>
        </form>
        <Note msg={pwMsg?.t ?? null} error={pwMsg?.e} />
      </Section>

      <Section title="Where you're signed in">
        <ul className="divide-y divide-rule border-y border-rule">
          {sessions.map((s) => {
            const current = s.id === currentSessionId;
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium">{describeAgent(s.userAgent)}</span>
                  {current && <span className="ml-2 text-[12px] text-accent">this device</span>}
                  <span className="block font-mono text-[11.5px] text-ink-3">
                    since {new Date(s.createdAt).toISOString().slice(0, 10)}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                  </span>
                </span>
                {!current && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      const { error } = await c.revokeSession({ token: s.token });
                      setSessMsg(error ? authErrorMessage(error) : "Signed out that device.");
                      void loadSessions();
                    }}
                  >
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await c.revokeSessions();
              await c.signOut();
              window.location.assign("/login");
            }}
          >
            Sign out everywhere
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await c.signOut();
              window.location.assign("/");
            }}
          >
            Sign out
          </button>
        </div>
        <Note msg={sessMsg} />
      </Section>

      <Section title="Delete account" tone="danger">
        <p className="text-sm text-ink-2">Deleting your account cannot be undone. It immediately:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>cancels any paid subscription of workspaces you own alone (no further charges; the current period is not refunded automatically),</li>
          <li>deletes those workspaces, their members&rsquo; access and every workflow saved in them,</li>
          <li>removes you from teams owned by someone else (workflows you saved there stay with the team, without your name),</li>
          <li>deletes your login, sessions and profile, and unlinks your usage statistics from you.</li>
        </ul>
        <p className="mt-2 text-sm text-ink-2">Spreadsheets were never stored, so there is nothing to delete there. Workflows saved in this browser stay in this browser.</p>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!delConfirm) return;
            setBusy(true);
            const { error } = await c.deleteUser({ password: delPw });
            setBusy(false);
            if (error) {
              setDelMsg(error.status === 400 || error.status === 401 ? "Password is incorrect." : authErrorMessage(error));
              return;
            }
            window.location.assign("/?account=deleted");
          }}
        >
          <div className="max-w-sm">
            <label htmlFor={ids.del} className="label">
              Your password
            </label>
            <input id={ids.del} type="password" className="field" value={delPw} onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" required />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 accent-accent" checked={delConfirm} onChange={(e) => setDelConfirm(e.target.checked)} />I understand this permanently deletes my account and the data listed above.
          </label>
          <button type="submit" className="btn border-del-ink text-del-ink" disabled={!delConfirm || busy}>
            {busy ? "Deleting…" : "Delete my account"}
          </button>
          <Note msg={delMsg} error />
        </form>
      </Section>
    </div>
  );
}
