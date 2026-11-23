import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { Scanner } from "@/components/Scanner";
import { reportOffer } from "@/lib/offer";
import { ExampleReport } from "@/components/home/ExampleReport";
import { ExampleLinkCheck } from "@/components/home/ExampleLinkCheck";
import { FROM_PRICE, PLAN_SUMMARY, TOOLS, getTool } from "@/content/tools";
import { CHECK_DOCS } from "@/lib/check-docs";
import { env } from "@/lib/env";
import type { ChangeKind } from "@/lib/monitoring/diff";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = getTool((await params).slug);
  if (!t) return {};
  return {
    title: { absolute: `${t.title} · ChangeKite` },
    description: t.description,
    alternates: { canonical: `/tools/${t.slug}` },
    openGraph: { type: "website", title: t.h1, description: t.description },
  };
}

/** What each monitoring alert means, in the words of monitoring/diff.ts detectChanges. */
const ALERT_LABELS: Record<ChangeKind, string> = {
  site_down: "The site stops answering (no HTTP response).",
  site_up: "The site is reachable again.",
  home_status: "The home page switches between a success and an error status.",
  new_broken_links: "New broken internal links appear.",
  new_critical: "Any other new critical issue appears.",
  cert_expiring: "The TLS certificate starts expiring within 14 days, expires or is no longer trusted.",
  robots_blocks_all: "robots.txt starts blocking the whole site for every crawler.",
  score_drop: "The score drops by 10 points or more.",
};

/** Tool pages whose preview shows the links part of a report instead of the whole report. */
const LINK_TOOLS = new Set(["broken-link-checker", "find-404-pages", "monitor-website-for-broken-links"]);

/** The scan button names the job on the most common tool pages. */
const TOOL_CTA: Record<string, string> = {
  "broken-link-checker": "Check links",
  "find-404-pages": "Find 404s",
  "sitemap-checker": "Check sitemap",
  "robots-txt-checker": "Check robots.txt",
  "ssl-certificate-checker": "Check certificate",
};

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = getTool((await params).slug);
  if (!t) notFound();
  const base = new URL(env().APP_URL).origin;
  const docs = t.checks.map((id) => CHECK_DOCS.find((d) => d.id === id)!).filter(Boolean);
  const others = TOOLS.filter((o) => o.slug !== t.slug);
  const offer = reportOffer();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              name: "ChangeKite",
              url: `${base}/tools/${t.slug}`,
              applicationCategory: "WebApplication",
              operatingSystem: "Any (web browser)",
              description: t.description,
              offers: [
                { "@type": "Offer", name: "Free scan (summary and top issues)", price: "0", priceCurrency: "USD" },
                { "@type": "Offer", name: `${offer.name} (one-time, ${offer.duration})`, price: offer.price.replace("$", ""), priceCurrency: "USD" },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: t.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            {
              "@type": "HowTo",
              name: t.h1,
              step: t.howTo.map((s, i) => ({ "@type": "HowToStep", position: i + 1, text: s })),
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ChangeKite", item: `${base}/` },
                { "@type": "ListItem", position: 2, name: "Tools", item: `${base}/tools` },
                { "@type": "ListItem", position: 3, name: t.h1, item: `${base}/tools/${t.slug}` },
              ],
            },
          ],
        }}
      />

      <section aria-labelledby="tool-title" className="bg-ink px-3 pb-3 lg:px-4 lg:pb-4">
        <div className="tile relative mx-auto grid max-w-[1400px] gap-x-16 gap-y-7 bg-yellow px-6 pb-12 pt-9 text-ink sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:px-14 lg:pb-16 lg:pt-14">
          <div className="lg:col-start-1 lg:row-start-1">
            <nav aria-label="Breadcrumb" className="chip">
              <Link href="/tools" className="hover:underline">
                Tools
              </Link>{" "}
              <span className="text-white/80">/ {t.paid ? "Monitoring" : "Free scan"}</span>
            </nav>
            <h1 id="tool-title" className="display sticker ck-in mt-5 text-[2.4rem] sm:text-[3.5rem] lg:text-[4.25rem]">
              {t.h1}
            </h1>
            <p className="ck-in mt-5 max-w-[46ch] text-lg font-semibold leading-[1.5]" style={{ ["--d" as string]: "60ms" }}>
              {t.intro}
            </p>
          </div>
          <div className="order-last text-ink lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:pt-10">
            {LINK_TOOLS.has(t.slug) ? <ExampleLinkCheck /> : <ExampleReport />}
          </div>
          <Scanner layout="hero" cta={TOOL_CTA[t.slug]} offer={offer} />
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <section aria-labelledby="howto" className="pt-16 lg:pt-24">
          <h2 id="howto" className="display text-[2rem] sm:text-[2.75rem]">
            How to do it
          </h2>
          <ol className="mt-6 space-y-4">
            {t.howTo.map((s, i) => (
              <li key={s} className="grid grid-cols-[2.25rem_1fr] gap-3 leading-relaxed text-ink-soft">
                <span aria-hidden="true" className="num grid h-8 w-8 place-items-center rounded-full bg-yellow text-sm font-extrabold text-ink">
                  {i + 1}
                </span>
                <span className="pt-1">{s}</span>
              </li>
            ))}
          </ol>
        </section>

        {t.alertKinds && (
          <section aria-labelledby="alerts" className="mt-14">
            <h2 id="alerts" className="display text-[2rem] sm:text-[2.75rem]">
              When you get an email
            </h2>
            <p className="mt-3 leading-relaxed text-ink-soft">The first scan of a site is the baseline. After that, ChangeKite emails you when:</p>
            <ul className="mt-4 space-y-2 text-ink-soft">
              {t.alertKinds.map((k) => (
                <li key={k} className="rounded-2xl bg-white px-5 py-3.5 text-ink">
                  {ALERT_LABELS[k]}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="checks" className="mt-14">
          <h2 id="checks" className="display text-[2rem] sm:text-[2.75rem]">
            What the {docs.length === 1 ? "check looks" : "checks look"} at
          </h2>
          <div className="mt-6 grid gap-3">
            {docs.map((d) => (
              <div key={d.id} className="rounded-[24px] bg-white p-6 sm:p-8">
                <h3 className="text-lg font-extrabold tracking-[-0.02em]">
                  <Link href={`/docs#${d.id}`} className="hover:text-accent">
                    {d.title}
                  </Link>
                </h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{d.why}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
                  {d.severities.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <details className="group mt-4 rounded-2xl bg-paper">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
                    Technical details
                    <span aria-hidden="true" className="text-accent transition-transform duration-200 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <ul className="space-y-2 px-4 pb-4 pt-1 text-[0.95rem] leading-relaxed text-ink-soft">
                    {d.how.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="watch" className="tile mt-14 bg-cyan p-7 text-ink sm:p-10">
          <h2 id="watch" className="text-2xl font-extrabold tracking-[-0.025em]">
            {t.paid ? "Start monitoring" : "Want to know when it breaks again?"}
          </h2>
          <p className="mt-3 leading-relaxed text-ink-soft">
            Paid plans re-scan the sites you look after on a schedule and email you only when something changes. {PLAN_SUMMARY}. Cancel any time.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary">
              Create an account
            </Link>
            <Link href="/pricing" className="btn-secondary">
              See plans from {FROM_PRICE}
            </Link>
          </div>
        </section>

        <section aria-labelledby="faq" className="mt-14">
          <h2 id="faq" className="display text-[2rem] sm:text-[2.75rem]">
            Questions
          </h2>
          <dl className="mt-6 grid gap-2">
            {t.faq.map((f) => (
              <div key={f.q} className="rounded-[20px] bg-white px-6 py-5">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-2 leading-relaxed text-ink-soft">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="more" className="mt-14">
          <h2 id="more" className="text-2xl font-extrabold tracking-[-0.025em]">
            More checks
          </h2>
          <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/tools/${o.slug}`} className="text-accent underline underline-offset-4">
                  {o.h1}
                </Link>
              </li>
            ))}
          </ul>
          {t.guide && (
            <p className="mt-6">
              <Link href={t.guide.href} className="text-accent underline underline-offset-4">
                {t.guide.label}
              </Link>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
