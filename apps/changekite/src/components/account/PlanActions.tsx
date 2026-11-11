"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/client/track";
import { Notice, primaryButton, secondaryButton } from "@/components/ui";

async function post(path: string, body?: unknown): Promise<{ url?: string; message?: string; error?: string; status: number }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
  return { ...data, status: res.status };
}

function explain(r: { status: number; error?: string; message?: string }): string {
  if (r.error === "billing_not_configured" || r.status === 503) return r.message ?? "Online payments are not switched on yet. Nothing has been charged.";
  if (r.status === 403) return "Only the workspace owner can change the plan.";
  if (r.status === 409) return "This workspace already has a subscription. Use “Manage subscription” to switch plans or cancel.";
  return r.message ?? "Something went wrong. Please try again.";
}

export function PlanActions(props: {
  plans: { id: string; name: string; priceMonthlyCents: number }[];
  currentPlanId: string;
  subscribed: boolean;
  isOwner: boolean;
  autoCheckoutPlan: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function checkout(planId: string) {
    setBusy(planId);
    setError(null);
    track("checkout_started", { plan: planId });
    const r = await post("/api/billing/checkout", { planId });
    if (r.url) return window.location.assign(r.url);
    setBusy(null);
    setError(explain(r));
  }
  async function portal() {
    setBusy("portal");
    setError(null);
    const r = await post("/api/billing/portal");
    if (r.url) return window.location.assign(r.url);
    setBusy(null);
    setError(explain(r));
  }

  useEffect(() => {
    if (started.current) return;
    if (props.autoCheckoutPlan && props.isOwner && !props.subscribed && props.autoCheckoutPlan !== props.currentPlanId) {
      started.current = true;
      void checkout(props.autoCheckoutPlan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!props.isOwner) {
    return <Notice tone="info">Only the workspace owner can change the plan or payment details.</Notice>;
  }
  return (
    <div className="space-y-4">
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <div className="flex flex-wrap gap-3">
        {props.subscribed ? (
          <button type="button" className={primaryButton} disabled={busy !== null} onClick={portal}>
            {busy === "portal" ? "Opening…" : "Manage subscription, payment method or cancel"}
          </button>
        ) : (
          props.plans
            .filter((p) => p.priceMonthlyCents > 0)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === "solo" ? primaryButton : secondaryButton}
                disabled={busy !== null}
                onClick={() => {
                  track("upgrade_clicked", { plan: p.id });
                  void checkout(p.id);
                }}
              >
                {busy === p.id ? "Opening checkout…" : `Upgrade to ${p.name} — $${p.priceMonthlyCents / 100}/month`}
              </button>
            ))
        )}
      </div>
      {props.subscribed && (
        <p className="text-sm text-muted">
          Plan changes, cancellation and invoices are handled on Stripe&rsquo;s secure billing page. Downgrades and cancellations keep your current plan until the end of the paid period.
        </p>
      )}
    </div>
  );
}
