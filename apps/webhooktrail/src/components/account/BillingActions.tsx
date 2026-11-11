"use client";

import { useState } from "react";
import { track } from "@/lib/track";

async function post(path: string, body?: unknown): Promise<{ ok: boolean; url?: string; message?: string; status: number }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const j = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string | { message?: string } };
  const message = typeof j.error === "object" ? j.error?.message : (j.message ?? (typeof j.error === "string" ? j.error : undefined));
  return { ok: res.ok, url: j.url, message, status: res.status };
}

export function CheckoutButton({ planId, label, primary }: { planId: string; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <button
        type="button"
        className={`btn ${primary ? "btn-signal" : ""} justify-center h-9`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          track("upgrade_clicked", { plan: planId });
          track("checkout_started", { plan: planId });
          const r = await post("/api/billing/checkout", { planId });
          if (r.ok && r.url) return window.location.assign(r.url);
          setBusy(false);
          setMsg(
            r.status === 503
              ? "Billing is not configured on this server yet; your workspace stays on Free."
              : r.status === 403
                ? "Only the workspace owner can change the plan."
                : r.status === 409
                  ? "This workspace already has a subscription: use “Manage subscription” to switch plans."
                  : (r.message ?? `Checkout failed (${r.status}).`),
          );
        }}
      >
        {busy ? "Opening checkout…" : label}
      </button>
      {msg && (
        <p role="alert" className="text-[12.5px] text-err">
          {msg}
        </p>
      )}
    </div>
  );
}

export function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <button
        type="button"
        className="btn h-9"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await post("/api/billing/portal");
          if (r.ok && r.url) return window.location.assign(r.url);
          setBusy(false);
          setMsg(r.status === 503 ? "Billing is not configured on this server yet." : (r.message ?? `Could not open the billing portal (${r.status}).`));
        }}
      >
        {busy ? "Opening…" : "Manage subscription (change plan, card, cancel)"}
      </button>
      {msg && (
        <p role="alert" className="text-[12.5px] text-err">
          {msg}
        </p>
      )}
    </div>
  );
}
