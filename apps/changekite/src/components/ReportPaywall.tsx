"use client";

import { useEffect, useId, useRef } from "react";
import { track } from "@/lib/client/track";
import { lockedBreakdown, lockedHeadline, type LockedSummary } from "@/lib/report-gate";
import type { ReportOffer } from "@/lib/offer";
import { PassBuyButton } from "./PassBuyButton";

/**
 * Shown right under the free top issues: what is locked (counts only; the server never sent the details),
 * the one-time pass and the monitoring plans as the alternative.
 */
export function ReportPaywall({
  locked,
  startUrl,
  reportId,
  offer,
  where,
}: {
  locked: LockedSummary;
  startUrl: string;
  reportId: string;
  offer: ReportOffer;
  where: "report" | "scan";
}) {
  const headingId = useId();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    track("paywall_shown", { reason: "report_issues", where, hidden: locked.hidden });
  }, [locked.hidden, where]);

  const headline = lockedHeadline(locked, startUrl);

  return (
    <section aria-labelledby={headingId} className="no-print mt-8 border-2 border-ink bg-paper-deep/60 px-5 py-6 sm:px-8">
      <p className="eyebrow">Full report locked</p>
      <h3 id={headingId} className="mt-2 font-display text-2xl font-semibold leading-snug [overflow-wrap:anywhere]">
        {headline ?? "See every check in detail."}
      </h3>
      {locked.hidden > 0 && (
        <p className="mt-2 text-ink-soft">
          Not shown in the free report: {lockedBreakdown(locked)}.
          {locked.pagesHidden > 0 ? ` Also the page-by-page list of the ${locked.pagesHidden} pages read.` : ""}
        </p>
      )}
      <p className="mt-4 text-ink">
        Unlock the full report with fixes &mdash; <strong className="num">{offer.price}</strong> one-time.
      </p>
      <ul className="mt-3 space-y-1.5 text-[0.95rem] text-ink-soft">
        <li className="border-l border-rule pl-3">The full issue list with fixes for {offer.duration}, on every report you open</li>
        <li className="border-l border-rule pl-3">Rescans of up to {offer.pagesPerScan} pages (free scans stop at {offer.freePages})</li>
        {offer.pdf && <li className="border-l border-rule pl-3">PDF export</li>}
        <li className="border-l border-rule pl-3">No subscription, no account needed: charged once, ends by itself</li>
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <PassBuyButton passId={offer.passId} returnPath={`/report/${reportId}`} from={where} label={`Unlock the full report — ${offer.price}`} />
        <a
          href="/pricing"
          onClick={() => track("upgrade_clicked", { plan: "solo", from: "report_paywall" })}
          className="text-accent underline underline-offset-4"
        >
          Or monitor your sites: plans from {offer.soloPrice}/month
        </a>
      </div>
      <p className="mt-3 text-xs text-muted">Secure payment by Stripe. You come back to this report, unlocked.</p>
    </section>
  );
}
