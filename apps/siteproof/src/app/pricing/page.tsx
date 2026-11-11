import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description: "SiteProof is free for one-off scans. Paid plans for monitoring several sites are coming.",
};

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    sites: "Any public site",
    features: ["One-off scans, no account", "Up to 25 pages per scan", "50 external links checked", "Shareable report link", "5 scans per hour"],
    cta: { label: "Run a scan", href: "/" },
    available: true,
  },
  {
    name: "Solo",
    price: "$19",
    period: "/month",
    sites: "Up to 3 sites",
    features: ["Everything in Free", "Larger crawls per site", "Scheduled re-scans", "Email when something breaks", "Report history"],
    cta: { label: "Create account", href: "/signup?plan=solo" },
    available: false,
  },
  {
    name: "Agency",
    price: "$79",
    period: "/month",
    sites: "Up to 20 sites",
    features: ["Everything in Solo", "20 monitored sites", "Client-ready PDF reports", "Priority crawl queue"],
    cta: { label: "Create account", href: "/signup?plan=agency" },
    available: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <p className="eyebrow">Pricing</p>
      <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Free to inspect. Pay when you want it watched.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
        One-off scans are free and need no account. The paid plans add monitoring for the sites you look after.
        Accounts and billing are not open yet; the plans below show what is planned.
      </p>

      <div className="mt-12 grid border border-ink md:grid-cols-3">
        {PLANS.map((p) => (
          <section key={p.name} aria-labelledby={`plan-${p.name}`} className="flex flex-col border-b border-rule p-6 last:border-b-0 md:border-b-0 md:border-l md:first:border-l-0 sm:p-8">
            <h2 id={`plan-${p.name}`} className="font-display text-2xl font-semibold">
              {p.name}
            </h2>
            <p className="mt-4 flex items-baseline gap-1">
              <span className="num text-4xl">{p.price}</span>
              <span className="text-muted">{p.period}</span>
            </p>
            <p className="mt-1 text-sm font-medium text-ink-soft">{p.sites}</p>
            <ul className="mt-6 flex-1 space-y-2 text-[0.95rem] text-ink-soft">
              {p.features.map((f) => (
                <li key={f} className="border-l border-rule pl-3">
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Link
                href={p.cta.href}
                className={
                  p.available
                    ? "inline-flex min-h-11 items-center bg-accent px-5 font-medium text-white hover:bg-accent-hover"
                    : "inline-flex min-h-11 items-center border border-ink px-5 font-medium text-ink hover:bg-paper-deep"
                }
              >
                {p.cta.label}
              </Link>
              {!p.available && <p className="mt-2 text-xs text-muted">Not available yet</p>}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">Prices in US dollars. Taxes may apply where required.</p>
    </div>
  );
}
