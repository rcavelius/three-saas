"use client";

import { useState } from "react";
import { track } from "@/lib/client/track";

/** One click to Stripe Checkout for a one-time pass; comes back to `returnPath` (?pass=active when paid). */
export function PassBuyButton({
  passId,
  label,
  returnPath,
  from,
  className = "inline-flex min-h-12 items-center bg-accent px-6 font-medium text-white hover:bg-accent-hover disabled:opacity-60",
}: {
  passId: string;
  label: string;
  returnPath: string;
  from: "report" | "scan" | "pricing";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    track("pass_checkout_started", { pass: passId, from });
    try {
      const res = await fetch("/api/billing/pass/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passId, returnPath }),
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.message ?? "Checkout is not available right now. Nothing has been charged.");
    } catch {
      setError("Could not reach checkout. Check your connection and try again. Nothing has been charged.");
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={buy} disabled={busy} className={className}>
        {busy ? "Opening checkout…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-3 w-full border-l-2 border-fail bg-fail-wash px-3 py-2 text-sm text-ink">
          {error}
        </p>
      )}
    </>
  );
}
