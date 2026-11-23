"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { startCheckout } from "@/components/PlanButton";
import { track } from "@/lib/analytics";
import { formatBytes, formatLimit, type UpgradeOffer } from "@/lib/limits";

export type UpgradeFrom = "limit" | "files" | "download" | "workflows";

/** The plan's real numbers, as shown in every prompt (from the catalog, never typed by hand). */
export function offerFacts(o: UpgradeOffer): string[] {
  const facts = [`Files up to ${formatBytes(o.maxFileBytes).replace(/\.0 /, " ")}`, `${formatLimit(o.maxRows)} rows per file`, `${o.maxFiles} files at once`];
  if (o.savedWorkflows !== 0) facts.push(o.savedWorkflows < 0 ? "Unlimited workflows saved to your account" : `${o.savedWorkflows} workflows saved to your account`);
  return facts;
}

/**
 * An upgrade prompt shown where a paid plan really helps (a file over the limit, more files than the plan
 * handles, repeat cleanups). Logs upgrade_shown once and upgrade_clicked on the button.
 */
export function UpgradeNotice({ offer, from, title, body, signedIn }: { offer: UpgradeOffer; from: UpgradeFrom; title: string; body?: string; signedIn: boolean }) {
  const plan = offer.planId as "pro" | "business";
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    track("upgrade_shown", { plan, from });
  }, [plan, from]);
  const label = `Get ${offer.planName} · $${offer.priceMonthly}/month`;
  return (
    <aside aria-label={`Upgrade to ${offer.planName}`} className="rounded-[12px] border-2 border-ink bg-lemon-soft px-4 py-4 shadow-[4px_4px_0_var(--color-ink)] sm:px-5">
      <p className="text-[18px] font-extrabold tracking-[-0.01em]">{title}</p>
      {body && <p className="mt-1 text-[15px] font-medium">{body}</p>}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] font-bold">
        {offerFacts(offer).map((f) => (
          <li key={f} className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m4.5 12.5 5 5 10-11" />
            </svg>
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {signedIn ? (
          <button
            type="button"
            className="btn-pop !min-h-11 !px-4 !text-[16px]"
            disabled={busy}
            onClick={async () => {
              track("upgrade_clicked", { plan, from });
              setBusy(true);
              setMsg(await startCheckout(plan));
              setBusy(false);
            }}
          >
            {label}
          </button>
        ) : (
          <Link href={`/signup?plan=${plan}`} className="btn-pop !min-h-11 !px-4 !text-[16px]" onClick={() => track("upgrade_clicked", { plan, from })}>
            {label}
          </Link>
        )}
        <Link href="/pricing" className="text-[15px] font-bold underline decoration-2 underline-offset-4">
          Compare plans
        </Link>
        <span className="text-[13px] font-medium text-ink-2">Files are still cleaned in your browser and never uploaded.</span>
      </div>
      {msg && (
        <p role="alert" className="mt-2 text-[13px] text-del-ink">
          {msg}
        </p>
      )}
    </aside>
  );
}
