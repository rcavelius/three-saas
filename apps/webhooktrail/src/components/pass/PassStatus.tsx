"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { track } from "@/lib/track";
import type { PassStatusDTO } from "@/lib/types";
import { CopyButton } from "../ui";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Small "Pass active until …" note with the reusable unlock link for other devices. */
export function PassActiveNote({ pass, className = "" }: { pass: PassStatusDTO; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-muted ${className}`}>
      <span>
        <span aria-hidden className="inline-block size-2 rounded-full bg-ok mr-2 align-middle" />
        {pass.name} active until <span className="text-fg">{when(pass.expiresAt)}</span>.
      </span>
      {pass.unlockPath && (
        <span className="inline-flex items-center gap-2">
          Use this link to unlock on another device:
          <CopyButton className="btn h-7" label="Copy unlock link" text={() => `${location.origin}${pass.unlockPath}`} />
        </span>
      )}
    </p>
  );
}

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  unpaid: { ok: true, text: "Payment is still processing — this page unlocks when it clears." },
  canceled: { ok: true, text: "Checkout canceled. Nothing was charged." },
  expired: { ok: false, text: "That pass has ended." },
  revoked: { ok: false, text: "That pass was refunded, so it no longer unlocks anything." },
  invalid: { ok: false, text: "That unlock link is not valid." },
  error: { ok: false, text: "Could not check the payment just now. Reload this page in a moment." },
};

/**
 * Shows the result of a pass checkout (?pass=active|unpaid|canceled|expired|revoked|invalid|error, set by the
 * claim route or Stripe's cancel URL) once, then removes the parameter from the address bar.
 */
export function PassReturnNotice() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [recheck, setRecheck] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(location.href);
    const status = url.searchParams.get("pass");
    if (!status) return;
    const session = url.searchParams.get("pass_session");
    url.searchParams.delete("pass");
    url.searchParams.delete("pass_session");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    if (status === "unpaid" && session && /^cs_[A-Za-z0-9_]{1,200}$/.test(session)) {
      setRecheck(`/api/billing/pass/claim?session_id=${encodeURIComponent(session)}&next=${encodeURIComponent(url.pathname)}`);
    }
    if (status === "active") {
      track("pass_activated", { pass: "week" });
      setMsg({ ok: true, text: "Payment received. Your pass is active." });
      // /api/endpoints also links the pass to this browser's endpoints.
      api<{ pass: PassStatusDTO | null }>("/api/endpoints")
        .then((r) => {
          if (r.pass) setMsg({ ok: true, text: `Payment received. ${r.pass.name} active until ${when(r.pass.expiresAt)}.` });
        })
        .catch(() => undefined);
      return;
    }
    setMsg(MESSAGES[status] ?? null);
  }, []);

  if (!msg) return null;
  return (
    <div role="status" className={`border-b px-4 py-2 text-[13px] flex items-center gap-3 ${msg.ok ? "border-ok/40 bg-ok/5 text-ok" : "border-err/40 bg-err/5 text-err"}`}>
      <span>{msg.text}</span>
      {recheck && (
        <a className="underline underline-offset-2 text-[12.5px]" href={recheck}>
          Check again
        </a>
      )}
      <button type="button" className="ml-auto underline underline-offset-2 text-[12.5px]" onClick={() => setMsg(null)}>
        Dismiss
      </button>
    </div>
  );
}
