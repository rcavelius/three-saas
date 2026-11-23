import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutButton } from "@/components/account/BillingActions";
import { JsonLd } from "@/components/JsonLd";
import { PassBuyButton } from "@/components/pass/PassPaywall";
import { passLimits, passOffer, weekPass } from "@/lib/pass";
import { CATALOG, formatBytesShort, formatCount, limitsFromPlan, priceLabel } from "@/lib/plans";
import { serverViewer } from "@/lib/server-session";
import { Art } from "@/components/grid/Art";
import { PixelTitle } from "@/components/grid/PixelTitle";

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
    <div className="g-frame">
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
      <div className="g-fit wt-in border-b border-line px-4 pb-3 pt-5 md:px-5 md:pb-5 md:pt-8">
        <PixelTitle text="Pricing" lines={["Pricing"]} phoneEm={8} max={300} maxPhone={110} />
      </div>
      <div className="g-row grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="g-x flex flex-col justify-center gap-4 p-4 md:p-6">
          <p className="max-w-[46ch] text-[17px] leading-[27px] md:text-[20px] md:leading-[31px]">Start free. Pay for history, teams and replay.</p>
          <p className="g-read max-w-[60ch] text-[15px] leading-6 text-fg-muted">
            Free works without an account. One integration to debug this week? The {offer.name} is one {offer.price} payment, no subscription.
          </p>
        </div>
        <div className="g-x-r theme-console relative hidden items-center justify-center bg-black py-6 md:flex">
          <span aria-hidden="true" className="g-dot -bottom-[4px] -right-[4px]" />
          <div className="wt-float">
            <Art name="hook" sizes="120px" priority className="h-[190px] w-auto" />
          </div>
        </div>
      </div>

      <div className="g-row grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
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
          const dev = def.id === "developer";
          const card = (
            <section key={def.id} aria-labelledby={`plan-${def.id}`} className="g-x flex flex-col p-4 md:p-6">
              {dev && <span aria-hidden="true" className="g-dot -right-[4px] -top-[4px]" />}
              <h2 id={`plan-${def.id}`} className="g-cap">
                {def.name}
              </h2>
              <p className="mt-3">
                <span className="font-[family-name:var(--font-pixel)] text-[56px] font-bold leading-none">{priceLabel(def)}</span>
                <span className="font-mono text-[13px] text-fg-dim"> / month</span>
              </p>
              <dl className="mt-6 flex-1 divide-y divide-line border-y border-line">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2 text-[12.5px]">
                    <dt className="text-fg-dim">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6">
                {free ? (
                  <Link href="/#create" className="btn-cut btn-cut-ghost w-full">
                    Create a free endpoint
                  </Link>
                ) : viewer.user && isOwner ? (
                  <CheckoutButton planId={def.id} label={`Choose ${def.name}`} primary={dev} />
                ) : viewer.user ? (
                  <p className="text-[12.5px] text-fg-muted">Ask your workspace owner to upgrade.</p>
                ) : (
                  <Link href={`/signup?plan=${def.id}`} className={`btn-cut w-full ${dev ? "" : "btn-cut-ghost"}`}>
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
            <section key="pass" id="plan-pass-card" aria-labelledby="plan-pass" className="g-x theme-console flex flex-col bg-black! p-4 md:p-6">
              <h2 id="plan-pass" className="g-cap text-signal">
                {offer.name}
              </h2>
              <p className="mt-3">
                <span className="font-[family-name:var(--font-pixel)] text-[56px] font-bold leading-none">{offer.price}</span>
                <span className="font-mono text-[13px] text-fg-dim"> once, {offer.durationLabel}</span>
              </p>
              <p className="mt-2 font-mono text-[12px] text-fg-muted">No subscription. No account needed.</p>
              <dl className="mt-4 flex-1 divide-y divide-line border-y border-line">
                {passRows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2 text-[12.5px]">
                    <dt className="text-fg-dim">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11.5px] leading-[17px] text-fg-dim">* Replay goes to a destination you verify, which needs a free account.</p>
              <div className="mt-4">
                <PassBuyButton className="!rounded-none font-mono uppercase tracking-[0.08em]" />
              </div>
            </section>,
          ];
        })}
      </div>
      <p className="border-b border-line px-4 py-3 font-mono text-[12px] text-fg-dim md:px-5">
        Plan prices in USD per month; the {offer.name} is a single charge. Taxes may apply.
      </p>

      <section aria-labelledby="faq" className="mt-16 border-t border-line md:mt-24">
        <div className="g-row grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="g-x g-fit p-4 md:p-6">
            <PixelTitle as="h2" id="faq" text="Questions" lines={["Questions"]} phoneEm={8} max={88} maxPhone={56} />
          </div>
          <dl className="g-x">
            {FAQ.map(([q, a]) => (
              <div key={q} className="border-b border-line px-4 py-5 last:border-b-0 md:px-6">
                <dt className="text-[14px] font-bold">{q}</dt>
                <dd className="g-read mt-2 max-w-[70ch] text-[15px] leading-[25px] text-fg-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
