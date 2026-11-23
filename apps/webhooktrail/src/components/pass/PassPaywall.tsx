"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { CheckoutSource, PaywallReason } from "@/lib/analytics-events";
import { api, ApiError } from "@/lib/client";
import { track } from "@/lib/track";
import type { PassOffer } from "@/lib/types";
import { usePassOffer } from "./PassOfferContext";

function headline(reason: PaywallReason, o: PassOffer): string {
  switch (reason) {
    case "replay":
      return `Replay is part of the ${o.name}`;
    case "endpoint_limit":
      return `Up to ${o.endpoints} endpoints with the ${o.name}`;
    case "expiry":
      return `Keep this endpoint for ${o.lifetimeDays} days with the ${o.name}`;
    case "expired":
      return `Endpoints on the ${o.name} live ${o.lifetimeDays} days`;
    case "stored_limit":
      return `Keep ${o.requestsStored} requests per endpoint with the ${o.name}`;
    case "locked":
      return `Unpause it with the ${o.name}`;
  }
}

/** Starts the pass Checkout and leaves for Stripe. Returns an error message, or null while redirecting. */
export async function startPassCheckout(offer: PassOffer, reason: CheckoutSource): Promise<string | null> {
  track("pass_checkout_started", { pass: offer.passId, reason });
  try {
    const { url } = await api<{ url: string }>("/api/billing/pass/checkout", {
      method: "POST",
      body: { passId: offer.passId, returnPath: location.pathname },
    });
    location.href = url;
    return null;
  } catch (e) {
    return e instanceof ApiError ? e.message : "Could not open the checkout. Check your connection.";
  }
}

/**
 * The paywall at the moment of value: what is locked, the one-time pass (price, duration, what it adds) with a
 * one-click checkout, and the monthly plan as the secondary option.
 */
export function PassPaywall({
  reason,
  note,
  onClose,
  className = "",
}: {
  reason: PaywallReason;
  /** Extra honest context, e.g. that replay needs a free account. */
  note?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const offer = usePassOffer();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (!offer || shown.current) return;
    shown.current = true;
    track("paywall_shown", { reason });
  }, [offer, reason]);

  if (!offer) return null;

  async function buy() {
    setBusy(true);
    setError(null);
    const err = await startPassCheckout(offer!, reason);
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-h`} className={`rounded-[14px] border border-signal bg-surface-2 p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <h3 id={`${id}-h`} className="text-[16px] font-semibold tracking-[-0.02em]">
          {headline(reason, offer)}
        </h3>
        {onClose && (
          <button type="button" className="btn btn-ghost h-7 ml-auto shrink-0" onClick={onClose}>
            Not now
          </button>
        )}
      </div>
      <p className="mt-1 text-[13px] text-fg-muted">
        <span className="text-fg font-medium">{offer.price} one-time</span>, no subscription, no account needed. Lasts {offer.durationLabel}.
      </p>
      <ul className="mt-3 grid gap-1 font-mono text-[12.5px]">
        {[
          "Replay captured requests to your verified destination, with retries",
          `${offer.endpoints} active endpoints`,
          `${offer.lifetimeDays}-day endpoint lifetime and ${offer.historyDays}-day history`,
          `${offer.requestsStored} stored requests per endpoint`,
        ].map((t) => (
          <li key={t} className="flex gap-2">
            <span aria-hidden className="text-signal">
              +
            </span>
            {t}
          </li>
        ))}
      </ul>
      {note && <p className="mt-3 text-[12.5px] text-fg-dim">{note}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="btn btn-signal h-10 rounded-[10px] px-4" onClick={() => void buy()} disabled={busy}>
          {busy ? "Opening checkout…" : `Get the ${offer.name} — ${offer.price}`}
        </button>
        <Link className="text-[12.5px] text-fg-muted underline underline-offset-2 hover:text-fg" href="/pricing">
          or {offer.developerName}, {offer.developerPrice}/month
        </Link>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-err">
          {error}
        </p>
      )}
    </section>
  );
}

/** The pass checkout button on its own (pricing page). */
export function PassBuyButton({ className = "" }: { className?: string }) {
  const offer = usePassOffer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!offer) return null;
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className={`btn btn-signal h-11 w-full justify-center rounded-[10px] text-[15px] ${className}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const err = await startPassCheckout(offer, "pricing");
          if (err) {
            setError(err);
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening checkout…" : `Get the ${offer.name} — ${offer.price}`}
      </button>
      {error && (
        <p role="alert" className="text-[12.5px] text-err">
          {error}
        </p>
      )}
    </div>
  );
}
