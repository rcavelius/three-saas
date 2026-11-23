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
    <section aria-labelledby={headingId} className="no-print relative mt-8 overflow-hidden rounded-[32px] bg-[linear-gradient(150deg,var(--color-pink),var(--color-orange))] px-6 py-8 text-ink sm:px-10 sm:py-10">
      <p><span className="chip">Full report locked</span></p>
      <h3 id={headingId} className="display mt-2 text-[28px] leading-[1.05] [overflow-wrap:anywhere] sm:text-[40px]">
        {headline ?? "See every check in detail."}
      </h3>
      {locked.hidden > 0 && (
        <p className="mt-3 font-semibold">
          Not shown in the free report: {lockedBreakdown(locked)}.
          {locked.pagesHidden > 0 ? ` Also the page-by-page list of the ${locked.pagesHidden} pages read.` : ""}
        </p>
      )}
      <p className="mt-5 text-lg font-semibold">
        Unlock the full report with fixes &mdash; <strong className="num">{offer.price}</strong> one-time.
      </p>
      <ul className="mt-3 space-y-2 text-[1rem] font-semibold">
        <li className="flex gap-2.5"><span aria-hidden="true" className="font-black">✓</span>The full issue list with fixes for {offer.duration}, on every report you open</li>
        <li className="flex gap-2.5"><span aria-hidden="true" className="font-black">✓</span>Rescans of up to {offer.pagesPerScan} pages (free scans stop at {offer.freePages})</li>
        {offer.pdf && <li className="flex gap-2.5"><span aria-hidden="true" className="font-black">✓</span>PDF export</li>}
        <li className="flex gap-2.5"><span aria-hidden="true" className="font-black">✓</span>No subscription, no account needed: charged once, ends by itself</li>
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <PassBuyButton
          passId={offer.passId}
          returnPath={`/report/${reportId}`}
          from={where}
          label={`Unlock the full report — ${offer.price}`}
          className="btn-primary disabled:opacity-60"
        />
        <a
          href="/pricing"
          onClick={() => track("upgrade_clicked", { plan: "solo", from: "report_paywall" })}
          className="font-extrabold text-ink underline underline-offset-4"
        >
          Or monitor your sites: plans from {offer.soloPrice}/month
        </a>
      </div>
      <p className="mt-4 text-sm font-semibold">Secure payment by Stripe. You come back to this report, unlocked.</p>
    </section>
  );
}
