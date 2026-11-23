import Link from "next/link";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";
import { MyEndpoints } from "@/components/MyEndpoints";
import { JsonLd } from "@/components/JsonLd";
import { weekPass } from "@/lib/pass";
import { MethodBadge } from "@/components/ui";
import { ExampleInspector } from "@/components/home/ExampleInspector";
import { JsonTree } from "@/components/inspector/JsonTree";
import { CATALOG, FREE_LIMITS, formatBytesShort, formatCount, limitsFromPlan, priceLabel } from "@/lib/plans";
import { TOOLS } from "@/content/tools";
import { GUIDES } from "./guides/guides";

const free = FREE_LIMITS;

function passPriceLabel(c: number): string {
  return "$" + (c / 100).toFixed(c % 100 ? 2 : 0);
}

/** The capability strip: one muted label, one bold value. Numbers come from the plan catalog. */
const STRIP: [string, string][] = [
  ["Methods", "Any HTTP method"],
  ["Paths", "Any sub-path"],
  ["Body", "JSON · form · raw · hex"],
  ["Headers", "Secrets masked"],
  ["Reply", "Your status + body"],
  ["Free plan", `${formatCount(free.requestsPerMonth)} req / month`],
];

/** The amber trace: a flat line with one recorded event. Draws once on load, then stays still. */
function Trace({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true" className={className} fill="none">
      <path d="M0 48H520" stroke="var(--color-line-strong)" strokeWidth="1" />
      <path d="M680 48H1200" stroke="var(--color-line-strong)" strokeWidth="1" />
      <path
        className="wt-trace"
        style={{ ["--trace-len" as string]: "1260" }}
        d="M0 48H540l10-24 16 44 12-32 6 12H1200"
        stroke="var(--color-signal)"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function StepCard({ n, title, body, children }: { n: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="wt-reveal relative flex flex-col rounded-[14px] border border-line bg-surface p-6 lg:min-h-[340px]">
      <p className="font-mono text-[12px] font-semibold text-signal">{n}</p>
      <h3 className="mt-3 text-[20px] font-semibold leading-[26px] tracking-[-0.03em]">{title}</h3>
      <p className="mt-2 text-[15px] leading-[23px] text-fg-muted">{body}</p>
      <div className="mt-6 rounded-[10px] border border-line bg-bg p-4">{children}</div>
    </li>
  );
}

export default function Home() {
  const plans = CATALOG.plans.map((p) => ({ def: p, lim: limitsFromPlan(p.id, p.limits, p.features, p.name) }));
  return (
    <div className="w-full">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "WebhookTrail",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          description: "Webhook endpoint generation, live request inspection and replay to verified destinations.",
          offers: [
            ...CATALOG.plans.map((p) => ({
              "@type": "Offer",
              name: p.name,
              price: (p.priceMonthlyCents / 100).toFixed(2),
              priceCurrency: "USD",
            })),
            { "@type": "Offer", name: weekPass().name, price: (weekPass().priceCents / 100).toFixed(2), priceCurrency: "USD" },
          ],
        }}
      />

      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div className="relative mx-auto grid max-w-[1280px] gap-5 px-5 pb-12 pt-8 md:px-8 md:pt-12 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:items-center lg:gap-8 lg:pt-16">
          <div id="create" className="scroll-mt-24">
            <p className="label wt-in">Webhook capture / live inspection</p>
            <h1 id="hero-title" className="wt-display wt-in mt-[18px] text-[40px] leading-[42px] sm:text-[56px] sm:leading-none xl:text-[76px]" style={{ ["--d" as string]: "40ms" }}>
              See exactly what the webhook <span className="text-signal">sent.</span>
            </h1>
            <p className="wt-in mt-5 max-w-[34rem] text-[15.5px] leading-6 text-fg-muted sm:mt-6 sm:text-[18px] sm:leading-[29px]" style={{ ["--d" as string]: "80ms" }}>
              <span className="sm:hidden">
                Create a private URL in one click. Send a webhook and inspect every header, path and payload. Control the response, no signup needed.
              </span>
              <span className="hidden sm:inline">
                Create a private capture URL in one click. Point Stripe, GitHub, your CI or your own service at it, and read every method, header,
                query and body byte as it arrives. Secrets stay masked until you reveal them, and you choose what the URL answers.
              </span>
            </p>
            <div className="wt-in mt-5 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-5" style={{ ["--d" as string]: "120ms" }}>
              <CreateEndpointButton full />
              <Link href="/docs" className="inline-flex h-11 items-center text-[15px] font-semibold text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg">
                Read the docs
              </Link>
            </div>
            <p className="wt-in mt-3.5 flex items-center gap-2 text-[13px] leading-[19px] text-fg-dim" style={{ ["--d" as string]: "160ms" }}>
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 self-start mt-[7px] rounded-full bg-ok" />
              No signup required. You land in the inspector with a curl command ready to paste.
            </p>
          </div>
          <ExampleInspector />
        </div>
      </section>

      {/* Capability strip */}
      <section aria-label="Capabilities" className="border-y border-line bg-surface/60">
        <dl className="mx-auto grid max-w-[1280px] grid-cols-2 px-5 md:grid-cols-3 md:px-8 lg:grid-cols-6">
          {STRIP.map(([k, v]) => (
            <div key={k} className="border-line py-5 pr-4 [&:not(:nth-child(-n+2))]:border-t md:[&:not(:nth-child(-n+3))]:border-t lg:!border-t-0 lg:border-l lg:pl-5 lg:first:border-l-0 lg:first:pl-0">
              <dt className="label">{k}</dt>
              <dd className="mt-1.5 whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em]">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mx-auto max-w-[1280px] px-5 md:px-8">
        <div className="pt-12 empty:hidden">
          <MyEndpoints />
        </div>

        {/* How it works: asymmetric, Inspect carries the most detail. */}
        <section aria-labelledby="how" className="pb-16 pt-16 lg:pb-[88px] lg:pt-24">
          <p className="label">01 / The workflow</p>
          <h2 id="how" className="wt-h2 wt-reveal mt-4 text-[32px] leading-9 md:text-[44px] md:leading-[48px]">
            Capture. Inspect. Respond.
          </h2>
          <p className="mt-3 max-w-[36rem] text-[16px] leading-[26px] text-fg-muted">One private URL. Every detail of the request. Full control over the reply.</p>
          <ol className="mt-8 grid gap-4 lg:grid-cols-[28fr_44fr_28fr]">
            <StepCard n="01" title="Capture" body="Create an endpoint and send anything to its URL. Every method and sub-path is recorded.">
              <p className="label">Capture URL</p>
              <p className="mt-2 break-all rounded-lg border border-line-strong bg-surface px-3 py-2.5 font-mono text-[12.5px] text-fg">
                https://webhooktrail.com/h/example-7f2a
              </p>
              <p className="mt-3 text-[13px] leading-5 text-fg-dim">Point Stripe, GitHub, CI or curl at it. Any path under it works too.</p>
            </StepCard>
            <StepCard n="02" title="Inspect" body="Requests appear while the tab is open, checked every two seconds. JSON tree, form fields, raw and hex views, copy as cURL.">
              <div className="flex items-center gap-2">
                <MethodBadge method="POST" />
                <span className="font-mono text-[12.5px]">/stripe/checkout</span>
                <span className="ml-auto font-mono text-[11.5px] text-ok">✓ 200</span>
              </div>
              <div className="mt-3">
                <JsonTree value={{ id: "evt_example_01", type: "checkout.session.completed", data: { object: { id: "cs_example_01", status: "complete" } } }} openDepth={4} className="text-[12.5px]" />
              </div>
              <p className="mt-3 grid grid-cols-[8.5rem_1fr] gap-2 border-t border-line pt-3 font-mono text-[12px]">
                <span className="text-fg-dim">stripe-signature</span>
                <span className="text-signal">••••••••</span>
              </p>
            </StepCard>
            <StepCard n="03" title="Respond" body="Choose the status code and body the URL answers with, to test how your sender handles failures.">
              <p className="label">Reply</p>
              <div className="mt-2 flex gap-2">
                <span className="rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-[12.5px]">503</span>
                <span className="flex-1 truncate rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-[12.5px] text-code">
                  {`{"error":"try again"}`}
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-5 text-fg-dim">Paid plans and the {weekPass().name} can also replay a captured request to a destination you have verified.</p>
            </StepCard>
          </ol>
        </section>

      </div>

      {/* Pricing teaser: one full-width tonal shift, heading above three equal columns. */}
      <div className="bg-[#0d141b]">
        <section aria-labelledby="plans" className="mx-auto max-w-[1280px] px-5 py-16 md:px-8 lg:py-20">
          <p className="label">02 / Plans</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <h2 id="plans" className="wt-h2 wt-reveal text-[32px] leading-9 md:text-[44px] md:leading-[48px]">
              Start debugging. Stay in control.
            </h2>
            <Link href="/pricing" className="font-semibold text-signal underline underline-offset-4">
              Compare every limit
            </Link>
          </div>
          <p className="mt-3 max-w-[40rem] text-[16px] leading-[26px] text-fg-muted">
            Free works without an account. Paid plans add longer history, more endpoints and replay to verified destinations. Or pay once: the {weekPass().name} is {passPriceLabel(weekPass().priceCents)}, no subscription.
          </p>
          <ul className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
            {plans.map(({ def, lim }) => {
              const isFree = def.id === CATALOG.freePlanId;
              const rows = [
                `${formatCount(lim.endpoints)} active endpoint${lim.endpoints === 1 ? "" : "s"}`,
                isFree ? `${lim.endpointTtlHours ?? 24} h lifetime, extendable to 7 days` : "Endpoints never expire",
                `${formatCount(lim.requestsPerMonth)} requests / month`,
                `${lim.historyDays}-day history, newest ${formatCount(lim.requestsStored)} per endpoint`,
                lim.replay ? "Replay to verified destinations" : `${formatBytesShort(lim.storedBodyBytes)} stored per request`,
              ];
              const dev = def.id === "developer";
              return (
                <li key={def.id} className={`wt-reveal flex flex-col rounded-[14px] border bg-surface p-[26px] md:min-h-[400px] ${dev ? "border-signal" : "border-line"}`}>
                  <h3 className="text-[18px] font-semibold leading-6">{def.name}</h3>
                  <p className="mt-3">
                    <span className="text-[40px] font-bold leading-[44px] tracking-[-0.04em] tabular-nums">{priceLabel(def)}</span>
                    <span className="text-[13px] text-fg-dim"> / month</span>
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-[14px] leading-[22px] text-fg-muted">
                    {rows.map((r) => (
                      <li key={r} className="flex gap-2">
                        <span aria-hidden="true" className="text-ok">
                          ✓
                        </span>
                        {r}
                      </li>
                    ))}
                  </ul>
                  <Link href={isFree ? "/#create" : "/pricing"} className={`btn mt-6 h-11 w-full justify-center rounded-[10px] text-[15px] ${dev ? "btn-signal" : ""}`}>
                    {isFree ? "Create endpoint" : `View ${def.name} plan`}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

      </div>

      <div className="mx-auto max-w-[1280px] px-5 md:px-8">
        {/* Resources */}
        <section aria-labelledby="resources" className="py-16 lg:py-[88px]">
          <p className="label">03 / Resources</p>
          <h2 id="resources" className="wt-h2 mt-4 text-[32px] leading-9 md:text-[36px] md:leading-[42px]">
            Go deeper when you need to.
          </h2>
          <div className="mt-8 grid gap-10 md:grid-cols-2 md:gap-12">
          <div>
            <h3 className="text-[20px] font-semibold leading-[26px] tracking-[-0.02em]">Tools</h3>
            <ul className="mt-4">
              {TOOLS.slice(0, 5).map((t) => (
                <li key={t.slug} className="border-b border-line">
                  <Link href={`/tools/${t.slug}`} className="group flex min-h-[52px] items-center justify-between gap-4 py-3 text-[15px] font-medium leading-[22px] hover:text-signal">
                    {t.h1}
                    <span aria-hidden="true" className="font-mono text-fg-dim transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-[20px] font-semibold leading-[26px] tracking-[-0.02em]">Guides</h3>
            <ul className="mt-4">
              {GUIDES.map((g) => (
                <li key={g.slug} className="border-b border-line">
                  <Link href={`/guides/${g.slug}`} className="group flex min-h-[52px] items-center justify-between gap-4 py-3 text-[15px] font-medium leading-[22px] hover:text-signal">
                    {g.title}
                    <span aria-hidden="true" className="font-mono text-fg-dim transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          </div>
        </section>
      </div>

      {/* Closing */}
      <section aria-labelledby="cta" className="relative overflow-hidden border-t border-line">
        <Trace className="pointer-events-none absolute inset-x-0 bottom-6 h-16 w-full opacity-60" />
        <div className="relative mx-auto flex max-w-[1280px] flex-col items-start gap-6 px-5 pb-28 pt-16 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="cta" className="wt-h2 text-[32px] leading-9 md:text-[52px] md:leading-[56px]">
            Your next webhook is one click away.
          </h2>
          <div>
            <CreateEndpointButton />
            <p className="mt-3 text-[13px] text-fg-dim">No signup required.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
