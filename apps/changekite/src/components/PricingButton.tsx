"use client";

import { useState } from "react";
import { track } from "@/lib/client/track";

const cls = "inline-flex min-h-11 items-center bg-accent px-5 font-medium text-white hover:bg-accent-hover disabled:opacity-60";

/**
 * signup: not signed in -> /signup?plan=… (checkout continues after email verification)
 * checkout: owner on the free plan -> Stripe Checkout
 * manage: already subscribed -> plan & billing page (portal)
 */
export function PricingButton({
  planId,
  label,
  mode,
  disabled,
  className = cls,
}: {
  planId: string;
  label: string;
  mode: "signup" | "checkout" | "manage" | "owner-only";
  disabled?: boolean;
  /** Styling only. */
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (mode === "signup" || mode === "manage" || mode === "owner-only") {
    const href = mode === "signup" ? `/signup?plan=${planId}` : "/account/billing";
    return (
      <>
        <a href={href} className={className} onClick={() => track("upgrade_clicked", { plan: planId, from: "pricing" })} aria-disabled={disabled || undefined}>
          {mode === "manage" && !disabled ? `Switch to this plan` : label}
        </a>
        {mode === "owner-only" && <p className="mt-2 text-sm opacity-90">Only the workspace owner can change the plan.</p>}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          track("upgrade_clicked", { plan: planId, from: "pricing" });
          track("checkout_started", { plan: planId });
          const res = await fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ planId }),
            credentials: "same-origin",
          });
          const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
          if (data.url) return window.location.assign(data.url);
          setBusy(false);
          setError(data.message ?? "Checkout is not available right now.");
        }}
      >
        {busy ? "Opening checkout…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-fail-wash px-3 py-2 text-sm text-fail">
          {error}
        </p>
      )}
    </>
  );
}
