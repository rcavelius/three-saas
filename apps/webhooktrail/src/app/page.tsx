import Link from "next/link";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";
import { MyEndpoints } from "@/components/MyEndpoints";
import { JsonLd } from "@/components/JsonLd";
import { passOffer, weekPass } from "@/lib/pass";
import { ExampleInspector } from "@/components/home/ExampleInspector";
import { Art } from "@/components/grid/Art";
import { PixelTitle } from "@/components/grid/PixelTitle";
import { TraceCell } from "@/components/grid/TraceCell";
import { FlowDiagram } from "@/components/grid/FlowDiagram";
import { LoopVideo } from "@/components/home/LoopVideo";
import { CATALOG, FREE_LIMITS, formatCount, limitsFromPlan, priceLabel } from "@/lib/plans";
import { TOOLS } from "@/content/tools";
import { GUIDES } from "./guides/guides";

/**
 * v2 home: "Catch every hook". A light drafting-board grid (Figma 2026 trends: retrofuturism, bold
 * typography, 3D elements, experimental navigation, motion). Very little copy, all of it mono.
 * Senders are plain text labels that link to the matching tester page; they are not customers.
 */

function Dot({ at }: { at: "tl" | "tr" | "bl" | "br" }) {
  const pos = { tl: "-left-[4px] -top-[4px]", tr: "-right-[4px] -top-[4px]", bl: "-left-[4px] -bottom-[4px]", br: "-right-[4px] -bottom-[4px]" }[at];
  return <span aria-hidden="true" className={`g-dot ${pos}`} />;
}

export default function Home() {
  const offer = passOffer();
  const plans = CATALOG.plans.map((p) => ({ def: p, lim: limitsFromPlan(p.id, p.limits, p.features, p.name) }));
  const free = plans.find((p) => p.def.id === CATALOG.freePlanId)!;
  const paid = plans.filter((p) => p.def.id !== CATALOG.freePlanId);
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

      <div className="g-frame">
        {/* Hero: the giant word runs edge to edge. */}
        <section aria-labelledby="hero-title" id="create" className="scroll-mt-20">
          <div className="g-fit wt-in border-b border-line px-4 pb-3 pt-5 md:px-5 md:pb-5 md:pt-8">
            <PixelTitle id="hero-title" text="Catch every hook" lines={["Catch every hook"]} phoneEm={4.5} max={260} maxPhone={110} tall />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-line px-4 py-2.5 md:px-5">
            <p className="g-cap">Webhook capture · inspect · replay</p>
            <p className="g-cap hidden text-fg-dim sm:block">
              Free · {formatCount(FREE_LIMITS.requestsPerMonth)} requests / month · no signup
            </p>
          </div>

          <div className="g-row grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
            {/* Mascot (first on phones, centre on desktop). */}
            <div className="g-x relative flex items-end justify-center overflow-hidden pt-6 lg:order-2 lg:min-h-[560px] lg:pt-10">
              <Dot at="tr" />
              <div className="relative">
                <div className="wt-float relative z-[1]">
                  <Art name="mascot" priority sizes="(min-width: 1024px) 300px, 160px" className="h-[250px] w-auto select-none sm:h-[340px] lg:h-[500px]" />
                </div>
                <span aria-hidden="true" className="wt-shadow absolute -bottom-1 left-1/2 h-4 w-[70%] -translate-x-1/2 rounded-[50%] bg-black/30 blur-[6px]" />
              </div>
              <p className="g-cap absolute left-4 top-4 hidden text-fg-faint lg:block">unit_01 / receiver</p>
            </div>

            {/* Promise + action. */}
            <div className="g-x flex flex-col justify-between gap-6 p-4 md:p-5 lg:order-1 lg:p-6">
              <div className="flex flex-col gap-5">
                <div className="order-2 lg:order-1">
                  <p className="max-w-[26ch] text-[16px] leading-[25px] text-fg lg:text-[22px] lg:leading-[32px]">
                    One private URL records every request. Read each header and byte, choose the reply, replay it.
                  </p>
                </div>
                <div className="order-1 lg:order-2">
                  <CreateEndpointButton full />
                  <p className="mt-2.5 font-mono text-[12px] leading-[18px] text-fg-dim">No signup. curl command ready to paste.</p>
                  <div className="mt-4 border border-line bg-bg p-3">
                    <p className="g-cap text-fg-dim">Then send your first test</p>
                    <pre className="mt-2 overflow-x-auto font-mono text-[12px] leading-[18px]">
                      <code>{`curl -X POST 'https://webhooktrail.com/h/<your-slug>/hello' \\
  -H 'Content-Type: application/json' \\
  -d '{"event":"ping","ok":true}'`}</code>
                    </pre>
                    <p className="mt-2 font-mono text-[12px] leading-[18px] text-fg-dim">
                      Your real URL is on the next screen. The request shows up in the inspector with its method, headers and body.
                    </p>
                  </div>
                </div>
              </div>
              <dl className="hidden grid-cols-2 gap-px bg-line lg:grid">
                {[
                  ["Methods", "Any"],
                  ["Body", "JSON · form · raw · hex"],
                  ["Secrets", "Masked"],
                  ["Reply", "Your status"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-bg py-2.5 pr-2">
                    <dt className="g-cap text-fg-faint">{k}</dt>
                    <dd className="mt-1 text-[13px] font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* The black cell: a live-looking (example) trace. */}
            <div className="g-x relative hidden p-4 md:p-5 lg:order-3 lg:block lg:p-6">
              <Dot at="br" />
              <TraceCell className="aspect-square max-h-[420px] w-full lg:aspect-auto lg:h-full" />
            </div>
          </div>

          {/* One-glance explainer: sender -> your URL -> inspector -> replay. */}
          <FlowDiagram replayNote={`Replay to a URL you verified. Paid plans or the ${offer.name}.`} />

          {/* The same story as a short silent loop: a sender fires a hook, the receiver catches it, reads it, replays it. */}
          <div aria-labelledby="loop-title" role="group" className="g-row border-t border-line grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="g-x relative overflow-hidden bg-bg p-2 md:p-3">
              <LoopVideo src="/video/explainer" poster="/video/explainer-poster.webp" width={960} height={540} className="block aspect-video h-auto w-full" />
            </div>
            <div className="g-x flex flex-col justify-center gap-4 p-4 md:p-6">
              <p className="g-cap text-fg-dim">Watch it work</p>
              <h2 id="loop-title" className="font-mono text-[26px] font-extrabold leading-[32px] tracking-[-0.02em] lg:text-[34px] lg:leading-[42px]">
                Catch <span aria-hidden="true">→</span>
                <span className="sr-only">, then</span> inspect <span aria-hidden="true">→</span>
                <span className="sr-only">, then</span> replay.
              </h2>
              <p className="max-w-[34ch] text-[15px] leading-6">
                Your URL catches every request, shows you exactly what came in, and sends it again when you are ready.
              </p>
              <a href="#create" className="btn btn-signal self-start">
                Get my URL <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>

        <div className="empty:hidden [&>*]:border-b [&>*]:border-line [&>*]:p-4 md:[&>*]:p-5">
          <MyEndpoints />
        </div>

        {/* The product, on sample data, in a black console cell. */}
        <section aria-labelledby="see" className="wt-reveal mt-16 border-t border-line md:mt-24">
          <div className="g-row grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
            <div className="g-x flex flex-col justify-between gap-6 p-4 md:p-6">
              <div className="g-fit">
                <PixelTitle as="h2" id="see" text="See every byte" lines={["See every", "byte"]} phoneEm={9} max={84} maxPhone={64} />
                <p className="mt-5 max-w-[28ch] text-[15px] leading-6">The real inspector, on sample data. Click a request.</p>
              </div>
              <Link href="/docs" className="g-cap underline decoration-2 underline-offset-[5px] hover:text-signal">
                Read the docs →
              </Link>
            </div>
            <div className="theme-console bg-black p-2 sm:p-4 lg:p-6">
              <ExampleInspector />
            </div>
          </div>
        </section>

        {/* Plans: four cells, numbers from the catalog. */}
        <section aria-labelledby="plans" className="wt-reveal mt-16 border-t border-line md:mt-24">
          <div className="g-fit flex flex-col gap-3 border-b border-line px-4 py-5 md:flex-row md:items-end md:justify-between md:px-5 md:py-6">
            <div className="md:w-[60%]">
              <PixelTitle as="h2" id="plans" text="Plans" lines={["Plans"]} max={120} maxPhone={84} phoneEm={6} />
            </div>
            <Link href="/pricing" className="g-cap underline decoration-2 underline-offset-[5px] hover:text-signal">
              Compare every limit →
            </Link>
          </div>
          <ul className="g-row grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <li className="g-x flex flex-col p-4 md:p-6">
              <h3 className="g-cap">{free.def.name}</h3>
              <p className="mt-3 font-[family-name:var(--font-pixel)] text-[56px] font-bold leading-none">{priceLabel(free.def)}</p>
              <p className="mt-4 flex-1 font-mono text-[13px] leading-5 text-fg-muted">
                {formatCount(free.lim.requestsPerMonth)} requests / month. No account.
              </p>
              <a href="#create" className="g-cap mt-6 hover:text-signal">
                Create endpoint →
              </a>
            </li>
            <li className="g-x flex flex-col bg-fg! p-4 text-bg md:p-6">
              <Dot at="tl" />
              <h3 className="g-cap">{offer.name}</h3>
              <p className="mt-3 font-[family-name:var(--font-pixel)] text-[56px] font-bold leading-none">{offer.price}</p>
              <p className="mt-4 flex-1 font-mono text-[13px] leading-5 opacity-80">Once. No subscription. Unlocks replay.</p>
              <Link href="/pricing#plan-pass" className="g-cap mt-6 text-[#ff8a54] hover:underline">
                Get the pass →
              </Link>
            </li>
            {paid.map(({ def, lim }) => (
              <li key={def.id} className="g-x flex flex-col p-4 md:p-6">
                <h3 className="g-cap">{def.name}</h3>
                <p className="mt-3 font-[family-name:var(--font-pixel)] text-[56px] font-bold leading-none">
                  {priceLabel(def)}
                  <span className="font-mono text-[13px] font-normal"> /mo</span>
                </p>
                <p className="mt-4 flex-1 font-mono text-[13px] leading-5 text-fg-muted">
                  {formatCount(lim.requestsPerMonth)} requests / month. {lim.historyDays}-day history.{lim.teamSeats > 1 ? ` ${lim.teamSeats} seats.` : ""}
                </p>
                <Link href="/pricing" className="g-cap mt-6 hover:text-signal">
                  See {def.name} →
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Tools and guides: two lists of linked rows. */}
        <section aria-labelledby="more" className="wt-reveal mt-16 border-t border-line md:mt-24">
          <h2 id="more" className="sr-only">
            Tools and guides
          </h2>
          <div className="g-row grid-cols-1 md:grid-cols-2">
            {[
              { title: "Tools", href: "/tools", items: TOOLS.map((t) => [t.h1, `/tools/${t.slug}`] as const) },
              { title: "Guides", href: "/guides", items: GUIDES.map((g) => [g.title, `/guides/${g.slug}`] as const) },
            ].map((col) => (
              <div key={col.title} className="g-x">
                <h3 className="flex items-center justify-between border-b border-line px-4 py-4 md:px-5">
                  <Link href={col.href} className="font-[family-name:var(--font-pixel)] text-[32px] font-bold uppercase leading-none hover:text-signal">
                    {col.title}
                  </Link>
                  <span className="g-cap text-fg-faint">{col.items.length}</span>
                </h3>
                <ul>
                  {col.items.map(([label, href]) => (
                    <li key={href} className="border-b border-line last:border-b-0">
                      <Link href={href} className="g-link flex min-h-[52px] items-center justify-between gap-4 px-4 py-3 text-[14px] font-medium md:px-5">
                        {label}
                        <span aria-hidden="true" className="arr">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Close. */}
        <section aria-labelledby="cta" className="wt-reveal mt-16 border-t border-line md:mt-24">
          <div className="g-row grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="g-x g-fit flex flex-col justify-center gap-7 p-4 py-10 md:p-8">
              <PixelTitle as="h2" id="cta" text="Your next hook" lines={["Your next", "hook"]} phoneEm={9} max={150} maxPhone={72} />
              <div>
                <CreateEndpointButton />
                <p className="mt-2.5 font-mono text-[12px] text-fg-dim">One click. No signup.</p>
              </div>
            </div>
            <div className="g-x g-x-r theme-console relative flex items-center justify-center bg-black py-10">
              <Dot at="br" />
              <div className="wt-float">
                <Art name="hook" sizes="180px" className="h-[240px] w-auto md:h-[300px]" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
