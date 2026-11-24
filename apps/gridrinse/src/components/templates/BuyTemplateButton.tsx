"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

/**
 * Starts Stripe Checkout for a template (or the bundle) and leaves the page. A fetch, not a form post: the CSP's
 * form-action 'self' would block the redirect to checkout.stripe.com.
 */
export function BuyTemplateButton({
  productId,
  label,
  from,
  className = "btn-pop",
}: {
  productId: string;
  label: string;
  from: "catalog" | "template_page" | "tool_page" | "guide";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    track("template_checkout_started", { product: productId === "bundle" ? "bundle" : "single", from });
    try {
      const res = await fetch("/api/templates/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setError(body.message ?? "Checkout is not available right now. Nothing was charged.");
    } catch {
      setError("Could not reach the server. Nothing was charged.");
    }
    setBusy(false);
  }

  return (
    <div>
      <button type="button" onClick={buy} disabled={busy} className={className} data-buy={productId}>
        {busy ? "Opening secure checkout…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[15px] font-semibold text-del-ink">
          {error}
        </p>
      )}
    </div>
  );
}
