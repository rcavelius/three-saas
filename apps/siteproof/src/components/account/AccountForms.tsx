"use client";

import { useEffect, useState } from "react";
import { authClient, errorMessage } from "@/lib/client/auth-client";
import { Field, Notice, dangerButton, primaryButton, secondaryButton, fmtDate } from "@/components/ui";

export function ProfileForm({ name }: { name: string }) {
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const value = String(new FormData(e.currentTarget).get("name") ?? "").trim().slice(0, 60);
        const { error } = await authClient().updateUser({ name: value });
        setMsg(error ? { tone: "error", text: errorMessage(error, "Could not save.") } : { tone: "ok", text: "Saved." });
      }}
    >
      <Field id="profile-name" name="name" label="Name" defaultValue={name} maxLength={60} autoComplete="name" />
      {msg && (
        <Notice tone={msg.tone} role="status">
          {msg.text}
        </Notice>
      )}
      <button type="submit" className={secondaryButton}>
        Save name
      </button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const newPassword = String(f.get("newPassword") ?? "");
        if (newPassword.length < 10) return setMsg({ tone: "error", text: "Use at least 10 characters." });
        setBusy(true);
        const { error } = await authClient().changePassword({
          currentPassword: String(f.get("currentPassword") ?? ""),
          newPassword,
          revokeOtherSessions: true,
        });
        setBusy(false);
        if (error) return setMsg({ tone: "error", text: error.status === 400 || error.status === 401 ? "Your current password is not correct." : errorMessage(error, "Could not change the password.") });
        form.reset();
        setMsg({ tone: "ok", text: "Password changed. Other devices were signed out." });
      }}
    >
      <Field id="current-password" name="currentPassword" type="password" label="Current password" autoComplete="current-password" required />
      <Field id="new-password" name="newPassword" type="password" label="New password" autoComplete="new-password" required minLength={10} maxLength={128} hint="At least 10 characters. Other devices are signed out." />
      {msg && (
        <Notice tone={msg.tone} role="status">
          {msg.text}
        </Notice>
      )}
      <button type="submit" className={secondaryButton} disabled={busy}>
        Change password
      </button>
    </form>
  );
}

interface SessionInfo {
  id: string;
  token: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}

function describeAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function SessionsList({ currentSessionId }: { currentSessionId: string }) {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    const { data, error: err } = await authClient().listSessions();
    if (err) setError(errorMessage(err, "Could not load sessions."));
    else setSessions((data ?? []) as SessionInfo[]);
  };
  useEffect(() => {
    void load();
  }, []);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!sessions) return <p className="text-muted">Loading sessions…</p>;
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-rule border-y border-rule">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">
                {describeAgent(s.userAgent)} {s.id === currentSessionId && <span className="eyebrow ml-2 !text-pass">This device</span>}
              </p>
              <p className="text-sm text-muted">
                Signed in {fmtDate(new Date(s.createdAt).toISOString())} · last active {fmtDate(new Date(s.updatedAt).toISOString())}
              </p>
            </div>
            {s.id !== currentSessionId && (
              <button
                type="button"
                className={secondaryButton}
                onClick={async () => {
                  await authClient().revokeSession({ token: s.token });
                  await load();
                }}
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={secondaryButton}
        onClick={async () => {
          await authClient().revokeOtherSessions();
          await load();
        }}
      >
        Sign out all other devices
      </button>
    </div>
  );
}

export function DeleteAccountForm({ soleOwnerOrgs }: { soleOwnerOrgs: string[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("confirm") !== "on") return setError("Tick the box to confirm.");
        setBusy(true);
        setError(null);
        const { error: err } = await authClient().deleteUser({ password: String(f.get("password") ?? "") });
        if (err) {
          setBusy(false);
          setError(err.status === 400 || err.status === 401 ? "That password is not correct." : errorMessage(err, "Could not delete the account."));
          return;
        }
        window.location.assign("/?account=deleted");
      }}
    >
      <div className="space-y-2 text-ink-soft">
        <p>Deleting your account removes, permanently and immediately:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your login, profile and every signed-in session;</li>
          <li>
            {soleOwnerOrgs.length
              ? `the workspace${soleOwnerOrgs.length === 1 ? "" : "s"} you own alone (${soleOwnerOrgs.join(", ")}), with all monitored sites, scan history, alerts, team members and pending invitations;`
              : "your memberships in other workspaces (those workspaces and their data stay with their owners);"}
          </li>
          <li>any paid subscription of those workspaces, which is cancelled at once without a refund for the rest of the period.</li>
        </ul>
        <p>Free report links you created without signing in are not linked to your account; they expire on their own.</p>
      </div>
      <Field id="delete-password" name="password" type="password" label="Your password" autoComplete="current-password" required />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirm" className="mt-1 h-4 w-4 accent-[#a3271c]" />
        <span>I understand this cannot be undone.</span>
      </label>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <button type="submit" className={dangerButton} disabled={busy}>
        {busy ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
}

export { primaryButton };
