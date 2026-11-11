import type { Metadata } from "next";
import Link from "next/link";
import { formatBytesShort, formatHours, PLANS, type Plan } from "@/lib/plans";

export const metadata: Metadata = { title: "Pricing" };

function rows(p: Plan): [string, string][] {
  return [
    ["Active endpoints", String(p.endpoints)],
    ["Endpoint retention", formatHours(p.retentionHours)],
    ["Request history", `${p.historyPerEndpoint.toLocaleString("en-US")} per endpoint`],
    ["Stored payload", `${formatBytesShort(p.storedBodyBytes)} per request`],
    ["Max payload accepted", formatBytesShort(p.maxBodyBytes)],
    ["Capture rate", `${p.capturePerEndpointPerMinute.toLocaleString("en-US")} / min per endpoint`],
    ["Team seats", p.teamSeats > 1 ? String(p.teamSeats) : "1"],
  ];
}

export default function PricingPage() {
  const plans = [PLANS.free, PLANS.developer, PLANS.pro];
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-14">
      <p className="label">Pricing</p>
      <h1 className="mt-3 text-[32px] md:text-[40px] font-semibold tracking-[-0.02em]">Start free. Pay when you need history.</h1>
      <p className="mt-3 max-w-[60ch] text-[15px] text-fg-muted">
        The Free plan works today without an account. Paid plans need accounts, which are not available yet: nothing on this page
        charges you.
      </p>

      <div className="mt-10 grid gap-px bg-line border border-line rounded-[6px] overflow-hidden lg:grid-cols-3">
        {plans.map((p) => (
          <section key={p.id} aria-labelledby={`plan-${p.id}`} className="bg-surface p-6 flex flex-col">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={`plan-${p.id}`} className="text-[18px] font-semibold">
                {p.name}
              </h2>
              {!p.available && <span className="font-mono text-[11px] text-fg-dim border border-line-strong rounded-[3px] px-1.5">not on sale yet</span>}
              {p.available && <span className="font-mono text-[11px] text-signal border border-signal/50 rounded-[3px] px-1.5">live</span>}
            </div>
            <p className="mt-3">
              <span className="text-[34px] font-semibold tracking-tight tabular-nums">${p.priceMonthlyUsd}</span>
              <span className="text-fg-dim text-[13px]"> / month</span>
            </p>
            <dl className="mt-5 divide-y divide-line border-y border-line flex-1">
              {rows(p).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2 text-[13px]">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="font-mono text-[12.5px] text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6">
              {p.available ? (
                <Link href="/" className="btn btn-signal w-full justify-center h-10">
                  Create a free endpoint
                </Link>
              ) : (
                <Link href={`/signup?plan=${p.id}`} className="btn w-full justify-center h-10">
                  Get notified: accounts are coming
                </Link>
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-6 text-[12.5px] text-fg-dim max-w-[70ch]">
        Paid plan limits are the planned limits and may change before launch. Prices in USD, excluding applicable taxes.
      </p>
    </div>
  );
}
