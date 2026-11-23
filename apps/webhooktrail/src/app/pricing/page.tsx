import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutButton } from "@/components/account/BillingActions";
import { JsonLd } from "@/components/JsonLd";
import { CATALOG, formatBytesShort, formatCount, limitsFromPlan, priceLabel } from "@/lib/plans";
import { serverViewer } from "@/lib/server-session";

export const metadata: Metadata = {
  title: "Pricing",
  description: "WebhookTrail pricing: Free, Developer ($9/month) and Pro ($29/month). Webhook capture, inspection, team seats and safe replay.",
  alternates: { canonical: "/pricing" },
};

const FAQ: [string, string][] = [
  [
    "How does billing work?",
    "Paid plans are monthly subscriptions in US dollars, charged by Stripe. You can switch plans or cancel in the billing portal at any time. Taxes may apply.",
  ],
  [
    "What happens when I cancel?",
    "Your plan stays active until the end of the period you paid for, then the workspace moves to the Free plan. Endpoints above the Free limit are paused, not deleted; captured requests older than the Free history are removed by the normal retention job.",
  ],
  [
    "Do you offer refunds?",
    "Yes. If you were charged in error, or WebhookTrail did not work for you in your first 14 days of a paid plan, email support within 14 days of the charge and a person refunds it in full. Other refund requests are reviewed individually.",
  ],
  [
    "How long is data kept?",
    "Captured requests are kept for the plan's history period (1 day on Free, 7 days on Developer, 30 days on Pro) and only the newest requests per endpoint up to the plan's limit. Free endpoints expire after 24 hours unless extended (up to 7 days); paid endpoints do not expire. Deleting an endpoint or your account deletes its requests immediately.",
  ],
  [
    "What happens when I hit the monthly request limit?",
    "Capture URLs answer 429 with a JSON error (quota_exceeded) until the next calendar month (UTC) or until you upgrade. Owners get an email at 80%.",
  ],
  [
    "Is it secure?",
    "Capture URLs use unguessable 144-bit random slugs and never reveal data; inspection requires your session (or, for anonymous endpoints, your browser's owner cookie). Secrets are masked in the inspector by default. Replay only goes to destinations you have verified, over public internet addresses, never following redirects.",
  ],
];

export default async function PricingPage() {
  const { viewer } = await serverViewer();
  const isOwner = viewer.org?.role === "owner";
  const plans = CATALOG.plans.map((p) => ({ def: p, lim: limitsFromPlan(p.id, p.limits, p.features, p.name) }));
  const origin = process.env.APP_URL || "http://localhost:3003";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "WebhookTrail",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          url: origin,
          offers: CATALOG.plans.map((p) => ({
            "@type": "Offer",
            name: p.name,
            price: (p.priceMonthlyCents / 100).toFixed(2),
            priceCurrency: "USD",
            category: "subscription",
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
        }}
      />
      <p className="label">Pricing</p>
      <h1 className="mt-3 text-[32px] md:text-[40px] font-semibold tracking-[-0.02em]">Start free. Pay for history, teams and replay.</h1>
      <p className="mt-3 max-w-[60ch] text-[15px] text-fg-muted">
        The Free plan works without an account. An account keeps endpoints in a workspace; paid plans add longer history, larger payloads,
        replay to verified destinations and, on Pro, team seats.
      </p>

      <div className="mt-10 grid gap-px bg-line border border-line rounded-[6px] overflow-hidden lg:grid-cols-3">
        {plans.map(({ def, lim }) => {
          const free = def.id === CATALOG.freePlanId;
          const rows: [string, string][] = [
            ["Active endpoints", formatCount(lim.endpoints)],
            ["Endpoint lifetime", free ? `${lim.endpointTtlHours ?? 24} h (extendable to 7 days)` : "No expiry"],
            ["Captured requests / month", formatCount(lim.requestsPerMonth)],
            ["History", `${lim.historyDays} day${lim.historyDays === 1 ? "" : "s"}, newest ${formatCount(lim.requestsStored)} per endpoint`],
            ["Stored payload", `${formatBytesShort(lim.storedBodyBytes)} per request`],
            ["Max payload accepted", formatBytesShort(lim.maxBodyBytes)],
            ["Replay to verified destinations", lim.replay ? "Yes, with retries" : "No"],
            ["Team seats", String(lim.teamSeats)],
          ];
          return (
            <section key={def.id} aria-labelledby={`plan-${def.id}`} className="bg-surface p-6 flex flex-col">
              <h2 id={`plan-${def.id}`} className="text-[18px] font-semibold">
                {def.name}
              </h2>
              <p className="mt-3">
                <span className="text-[34px] font-semibold tracking-tight tabular-nums">{priceLabel(def)}</span>
                <span className="text-fg-dim text-[13px]"> / month</span>
              </p>
              <dl className="mt-5 divide-y divide-line border-y border-line flex-1">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2 text-[13px]">
                    <dt className="text-fg-muted">{k}</dt>
                    <dd className="font-mono text-[12.5px] text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6">
                {free ? (
                  <Link href="/" className="btn w-full justify-center h-10">
                    Create a free endpoint
                  </Link>
                ) : viewer.user && isOwner ? (
                  <CheckoutButton planId={def.id} label={`Choose ${def.name}`} primary={def.id === "developer"} />
                ) : viewer.user ? (
                  <p className="text-[12.5px] text-fg-muted">Ask your workspace owner to upgrade.</p>
                ) : (
                  <Link href={`/signup?plan=${def.id}`} className={`btn w-full justify-center h-10 ${def.id === "developer" ? "btn-signal" : ""}`}>
                    Start with {def.name}
                  </Link>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-[12.5px] text-fg-dim max-w-[70ch]">Prices in USD per month, excluding applicable taxes.</p>

      <section aria-labelledby="faq" className="mt-14 max-w-3xl">
        <h2 id="faq" className="text-[22px] font-semibold">
          Questions
        </h2>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-4">
              <dt className="font-medium text-[15px]">{q}</dt>
              <dd className="mt-1 text-[14px] text-fg-muted leading-relaxed">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
