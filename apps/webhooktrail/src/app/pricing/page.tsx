import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutButton } from "@/components/account/BillingActions";
import { JsonLd } from "@/components/JsonLd";
import { PassBuyButton } from "@/components/pass/PassPaywall";
import { passLimits, passOffer, weekPass } from "@/lib/pass";
import { CATALOG, formatBytesShort, formatCount, limitsFromPlan, priceLabel } from "@/lib/plans";
import { serverViewer } from "@/lib/server-session";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "WebhookTrail pricing: Free, a one-time 7-day pass ($5, no subscription), Developer ($9/month) and Pro ($29/month). Webhook capture, inspection, team seats and safe replay.",
  alternates: { canonical: "/pricing" },
};

const offer = passOffer();

const FAQ: [string, string][] = [
  [
    `What is the ${offer.name}?`,
    `A one-time payment of ${offer.price} that unlocks replay and the larger limits shown above for ${offer.durationLabel}: ${offer.endpoints} active endpoints, ${offer.lifetimeDays}-day endpoint lifetime and history, and ${offer.requestsStored} stored requests per endpoint. You do not need an account to buy it. Replay sends to a destination you have verified, which lives in a workspace, so replay itself needs a free account.`,
  ],
  [
    "Does the pass renew?",
    `No. It is charged once and never renews. Access ends ${offer.durationLabel} after payment; your endpoints then fall back to your plan's limits, the same way a cancelled subscription does.`,
  ],
  [
    "How do I use the pass on another device?",
    "The pass works in the browser that bought it. While it is active, the inspector shows an unlock link: open it in another browser to unlock that one too. If you bought it while signed in, it also counts for your whole workspace.",
  ],
  [
    "Can I get a refund for a pass?",
    "If a pass did not unlock what this page describes, email support within 7 days of purchase for a full refund; a refunded pass stops working.",
  ],
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
  const pass = weekPass();
  const pl = passLimits();
  const passRows: [string, string][] = [
    ["Active endpoints", formatCount(pl.endpoints)],
    ["Endpoint lifetime", `${offer.lifetimeDays} days`],
    ["Captured requests / month", "Same as your plan"],
    ["History", `${pl.historyDays} days, newest ${formatCount(pl.requestsStored)} per endpoint`],
    ["Stored payload", `${formatBytesShort(pl.storedBodyBytes)} per request`],
    ["Max payload accepted", formatBytesShort(pl.maxBodyBytes)],
    ["Replay to verified destinations", pl.replay ? "Yes, with retries*" : "No"],
    ["Team seats", "Same as your plan"],
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-12 md:px-8 md:py-16">
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
          })).concat([
            {
              "@type": "Offer",
              name: pass.name,
              price: (pass.priceCents / 100).toFixed(2),
              priceCurrency: "USD",
              category: "one-time purchase",
            },
          ]),
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
      <h1 className="mt-4 wt-display text-[40px] leading-[42px] md:text-[60px] md:leading-none">Start free. Pay for history, teams and replay.</h1>
      <p className="mt-4 max-w-[62ch] text-[16px] leading-[26px] text-fg-muted">
        The Free plan works without an account. Debugging one integration this week? The {offer.name} is a single {offer.price} payment,
        no subscription. Monthly plans add longer history, larger payloads, replay to verified destinations and, on Pro, team seats.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.flatMap(({ def, lim }) => {
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
          const card = (
            <section key={def.id} aria-labelledby={`plan-${def.id}`} className={`flex flex-col rounded-[14px] border bg-surface p-[26px] ${def.id === "developer" ? "border-signal" : "border-line"}`}>
              <h2 id={`plan-${def.id}`} className="text-[18px] font-semibold">
                {def.name}
              </h2>
              <p className="mt-3">
                <span className="text-[40px] font-bold leading-[44px] tracking-[-0.04em] tabular-nums">{priceLabel(def)}</span>
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
                  <Link href="/" className="btn h-11 w-full justify-center rounded-[10px] text-[15px]">
                    Create a free endpoint
                  </Link>
                ) : viewer.user && isOwner ? (
                  <CheckoutButton planId={def.id} label={`Choose ${def.name}`} primary={def.id === "developer"} />
                ) : viewer.user ? (
                  <p className="text-[12.5px] text-fg-muted">Ask your workspace owner to upgrade.</p>
                ) : (
                  <Link href={`/signup?plan=${def.id}`} className={`btn h-11 w-full justify-center rounded-[10px] text-[15px] ${def.id === "developer" ? "btn-signal" : ""}`}>
                    Start with {def.name}
                  </Link>
                )}
              </div>
            </section>
          );
          if (!free) return [card];
          // The one-time pass sits right after Free: the step up for a single debugging week.
          return [
            card,
            <section key="pass" aria-labelledby="plan-pass" className="flex flex-col rounded-[14px] border border-line-strong bg-surface-2 p-[26px]">
              <h2 id="plan-pass" className="text-[18px] font-semibold">
                {offer.name}
              </h2>
              <p className="mt-3">
                <span className="text-[40px] font-bold leading-[44px] tracking-[-0.04em] tabular-nums">{offer.price}</span>
                <span className="text-fg-dim text-[13px]"> once, for {offer.durationLabel}</span>
              </p>
              <p className="mt-1 text-[12.5px] text-fg-muted">One-time, no subscription, no account needed.</p>
              <dl className="mt-4 divide-y divide-line border-y border-line flex-1">
                {passRows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2 text-[13px]">
                    <dt className="text-fg-muted">{k}</dt>
                    <dd className="font-mono text-[12.5px] text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[12px] text-fg-dim">* Replay goes to a destination you verify, which needs a free account.</p>
              <div className="mt-4">
                <PassBuyButton />
              </div>
            </section>,
          ];
        })}
      </div>
      <p className="mt-6 text-[12.5px] text-fg-dim max-w-[70ch]">
        Plan prices in USD per month; the {offer.name} is a single charge. Taxes may apply.
      </p>

      <section aria-labelledby="faq" className="mt-14 max-w-3xl">
        <h2 id="faq" className="wt-h2 text-[32px] md:text-[44px]">
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
