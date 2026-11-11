"use client";

import { useState } from "react";
import { openPortal, startCheckout } from "@/components/PlanButton";
import { track } from "@/lib/analytics";

export function BillingActions({
  isOwner,
  currentPlanId,
  subscribed,
  plans,
}: {
  isOwner: boolean;
  currentPlanId: string;
  subscribed: boolean;
  plans: { id: string; name: string; price: number }[];
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!isOwner) return <p className="text-sm text-ink-2">Only the workspace owner can change the plan.</p>;
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setMsg(await fn());
    setBusy(false);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {plans
          .filter((p) => p.id !== "free" && p.id !== currentPlanId)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                track("upgrade_clicked", { from: "billing", plan: p.id as "pro" | "business" });
                void run(() => (subscribed ? openPortal() : startCheckout(p.id)));
              }}
            >
              {subscribed ? `Switch to ${p.name}` : `Upgrade to ${p.name}`} (${p.price}/mo)
            </button>
          ))}
        {subscribed && (
          <button type="button" className="btn" disabled={busy} onClick={() => void run(openPortal)}>
            Manage billing (card, invoices, cancel)
          </button>
        )}
      </div>
      {msg && (
        <p role="alert" className="mt-3 border-l-2 border-del-ink bg-del px-3 py-2 text-sm text-del-ink">
          {msg}
        </p>
      )}
    </div>
  );
}
