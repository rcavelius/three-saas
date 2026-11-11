"use client";

import Link from "next/link";
import { useState } from "react";
import { track } from "@/lib/analytics";
import type { ClientEntitlements } from "@/lib/limits";
import { useEntitlements } from "@/lib/useEntitlements";

/** Starts Stripe Checkout (owner) or opens the billing portal; returns a readable error message. */
export async function startCheckout(planId: string): Promise<string | null> {
  track("checkout_started", { plan: planId as "pro" | "business" });
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
    if (res.ok && body.url) {
      window.location.assign(body.url);
      return null;
    }
    if (body.error === "already_subscribed") return openPortal();
    if (res.status === 403) return "Only the workspace owner can change the plan.";
    return body.message ?? "Checkout is not available right now.";
  } catch {
    return "Could not reach the server.";
  }
}

export async function openPortal(): Promise<string | null> {
  try {
    const res = await fetch("/api/billing/portal", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
    const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (res.ok && body.url) {
      window.location.assign(body.url);
      return null;
    }
    return body.message ?? "The billing portal is not available right now.";
  } catch {
    return "Could not reach the server.";
  }
}

export function PlanButton({ planId, planName, primary }: { planId: string; planName: string; primary?: boolean }) {
  const { entitlements } = useEntitlements();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cls = `btn ${primary ? "btn-primary" : ""}`;
  if (planId === "free") {
    return (
      <Link href="/" className="btn">
        Use it now
      </Link>
    );
  }
  const e: ClientEntitlements | null = entitlements;
  if (!e?.signedIn) {
    return (
      <Link href={`/signup?plan=${encodeURIComponent(planId)}`} className={cls} onClick={() => track("upgrade_clicked", { from: "pricing", plan: planId as "pro" })}>
        Choose {planName}
      </Link>
    );
  }
  if (e.planId === planId) return <p className="text-[13px] font-medium">Your current plan</p>;
  return (
    <div>
      <button
        type="button"
        className={cls}
        disabled={busy}
        onClick={async () => {
          track("upgrade_clicked", { from: "pricing", plan: planId as "pro" });
          setBusy(true);
          setMsg(await startCheckout(planId));
          setBusy(false);
        }}
      >
        Choose {planName}
      </button>
      {msg && (
        <p role="alert" className="mt-2 text-[12px] text-del-ink">
          {msg}
        </p>
      )}
    </div>
  );
}
