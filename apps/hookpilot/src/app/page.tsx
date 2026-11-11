import Link from "next/link";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";
import { MyEndpoints } from "@/components/MyEndpoints";
import { JsonLd } from "@/components/JsonLd";
import { CATALOG, FREE_LIMITS, formatBytesShort } from "@/lib/plans";

const free = FREE_LIMITS;

const SPEC: [string, string][] = [
  ["methods", "GET POST PUT PATCH DELETE HEAD OPTIONS"],
  ["url", "/h/<slug>/<any/sub/path>?<any query>"],
  ["stored body", `first ${formatBytesShort(free.storedBodyBytes)} per request`],
  ["rejected", `bodies over ${formatBytesShort(free.maxBodyBytes)} → 413`],
  ["history", `newest ${free.requestsStored} requests per endpoint`],
  ["quota", `${free.requestsPerMonth.toLocaleString("en-US")} captured requests per month`],
  ["lifetime", `${free.endpointTtlHours ?? 24} h, extendable up to 7 days`],
  ["reply", "200 {\"ok\":true,\"id\":…} or your own JSON / text"],
  ["account", "optional: anonymous endpoints belong to this browser"],
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "HookPilot",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          description: "Webhook endpoint generation, live request inspection and replay to verified destinations.",
          offers: CATALOG.plans.map((p) => ({
            "@type": "Offer",
            name: p.name,
            price: (p.priceMonthlyCents / 100).toFixed(2),
            priceCurrency: "USD",
          })),
        }}
      />
      <section className="pt-14 pb-12 md:pt-20 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div>
          <p className="label">Webhook capture · live inspection</p>
          <h1 className="mt-4 text-[34px] leading-[1.08] md:text-[48px] font-semibold tracking-[-0.025em] max-w-[16ch]">
            See exactly what the webhook sent.
          </h1>
          <p className="mt-5 text-[16px] leading-relaxed text-fg-muted max-w-[52ch]">
            One click gives you a private capture URL. Point Stripe, GitHub, your CI or your own service at it, then read every header,
            query parameter and body byte in a live console. Secrets stay masked until you reveal them.
          </p>
          <div className="mt-8">
            <CreateEndpointButton />
          </div>
          <p className="mt-3 text-[12.5px] text-fg-dim">
            Free, no sign-up. You land in the inspector with a curl command ready to paste.
          </p>
        </div>

        <div className="border border-line rounded-[6px] bg-surface overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-9 border-b border-line">
            <span aria-hidden className="size-2 bg-signal" />
            <span className="font-mono text-[11.5px] text-fg-muted">free endpoint · spec</span>
          </div>
          <dl className="divide-y divide-line">
            {SPEC.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-3 px-4 py-2.5 font-mono text-[12.5px]">
                <dt className="text-fg-dim">{k}</dt>
                <dd className="text-fg break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="pb-10">
        <MyEndpoints />
      </div>

      <section aria-labelledby="how" className="border-t border-line py-12">
        <h2 id="how" className="label">
          How it works
        </h2>
        <ol className="mt-6 grid gap-px bg-line border border-line rounded-[6px] overflow-hidden md:grid-cols-3">
          {[
            ["01 · capture", "Create an endpoint and send anything to its URL. Every method and sub-path is recorded with headers, query and body, streamed with hard size caps."],
            ["02 · inspect", "The console polls every two seconds while the tab is visible. Pretty JSON tree, form decoding, raw and hex views, copy as cURL."],
            ["03 · respond", "Choose the status code and a JSON or text body the URL answers with, to test how your sender handles failures."],
          ].map(([t, d]) => (
            <li key={t} className="bg-surface p-5">
              <h3 className="font-mono text-[12.5px] text-signal">{t}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[13.5px] text-fg-muted">
          Read the <Link className="text-signal underline underline-offset-2" href="/docs">documentation</Link> for limits, response codes and
          the inspection API, or see <Link className="text-signal underline underline-offset-2" href="/pricing">pricing</Link>.
        </p>
      </section>
    </div>
  );
}
