"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/client/track";
import { Field, Notice, dangerButton, primaryButton, secondaryButton } from "@/components/ui";

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string; site?: { id: string } };
  return { ok: res.ok, status: res.status, ...data };
}

export function AddSiteForm({ disabledReason }: { disabledReason: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  if (disabledReason) return <Notice tone="info">{disabledReason}</Notice>;
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const url = String(new FormData(form).get("url") ?? "").trim();
        if (!url) return;
        setBusy(true);
        setMsg(null);
        const r = await call("POST", "/api/sites", { url });
        setBusy(false);
        if (!r.ok) return setMsg({ tone: "error", text: r.message ?? "Could not add the site." });
        track("tool_used", { tool: "add_site" });
        form.reset();
        setMsg({ tone: "ok", text: "Site added. The first scan starts within a few minutes." });
        router.refresh();
      }}
    >
      <Field id="site-url" name="url" label="Website to monitor" placeholder="yourdomain.com" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} maxLength={2048} required />
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? "Adding…" : "Add site"}
      </button>
      {msg && (
        <div className="sm:col-span-2">
          <Notice tone={msg.tone} role="status">
            {msg.text}
          </Notice>
        </div>
      )}
    </form>
  );
}

export function ScanNowButton({ siteId, disabled }: { siteId: string; disabled?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={secondaryButton}
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          const r = await call("POST", `/api/sites/${siteId}/scan`);
          setBusy(false);
          setMsg(r.message ?? (r.ok ? "Scan queued." : "Could not queue a scan."));
        }}
      >
        Scan now
      </button>
      <span role="status" className="text-sm text-muted">
        {msg}
      </span>
    </div>
  );
}

export function SiteSettings(props: {
  siteId: string;
  paused: boolean;
  alertsMuted: boolean;
  alertRecipients: string[];
  members: { userId: string; label: string }[];
  canManage: boolean;
  emailAlerts: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    const r = await call("PATCH", `/api/sites/${props.siteId}`, body);
    setBusy(false);
    setMsg(r.ok ? { tone: "ok", text: ok } : { tone: "error", text: r.message ?? "Could not save." });
    if (r.ok) router.refresh();
  }
  if (!props.canManage) return <p className="text-sm text-muted">Only admins and owners can change monitoring settings.</p>;
  return (
    <div className="space-y-6">
      {msg && (
        <Notice tone={msg.tone} role="status">
          {msg.text}
        </Notice>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => patch({ paused: !props.paused }, props.paused ? "Monitoring resumed." : "Monitoring paused.")}>
          {props.paused ? "Resume monitoring" : "Pause monitoring"}
        </button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => patch({ alertsMuted: !props.alertsMuted }, props.alertsMuted ? "Alerts on." : "Alerts muted for this site.")}>
          {props.alertsMuted ? "Unmute alerts" : "Mute alerts"}
        </button>
      </div>
      {!props.emailAlerts && <Notice tone="info">Email alerts are part of the paid plans.</Notice>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const ids = new FormData(e.currentTarget).getAll("recipient").map(String);
          void patch({ alertRecipients: ids }, ids.length ? "Recipients saved." : "Alerts go to every member.");
        }}
      >
        <fieldset>
          <legend className="text-sm font-medium">Alert emails go to</legend>
          <p className="text-xs text-muted">None ticked = every member of the workspace.</p>
          <ul className="mt-2 space-y-1">
            {props.members.map((m) => (
              <li key={m.userId}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="recipient" value={m.userId} defaultChecked={props.alertRecipients.includes(m.userId)} className="h-4 w-4 accent-[#1d3a66]" />
                  {m.label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <button type="submit" className={`${secondaryButton} mt-3`} disabled={busy}>
          Save recipients
        </button>
      </form>
    </div>
  );
}

export function DeleteSiteButton({ siteId, host }: { siteId: string; host: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return confirming ? (
    <div className="space-y-3">
      <p className="text-sm">
        Stop monitoring <strong>{host}</strong> and delete its scan history and alerts? This cannot be undone.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          className={dangerButton}
          onClick={async () => {
            const r = await call("DELETE", `/api/sites/${siteId}`);
            if (!r.ok) return setError(r.message ?? "Could not delete.");
            window.location.assign("/dashboard");
          }}
        >
          Delete site and history
        </button>
        <button type="button" className={secondaryButton} onClick={() => setConfirming(false)}>
          Keep it
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  ) : (
    <button type="button" className={dangerButton} onClick={() => setConfirming(true)}>
      Remove site…
    </button>
  );
}
