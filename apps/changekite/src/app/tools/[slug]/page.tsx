import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { Scanner } from "@/components/Scanner";
import { reportOffer } from "@/lib/offer";
import { primaryButton, secondaryButton } from "@/components/ui";
import { FROM_PRICE, PLAN_SUMMARY, TOOLS, getTool } from "@/content/tools";
import { CHECK_DOCS } from "@/lib/check-docs";
import { env } from "@/lib/env";
import type { ChangeKind } from "@/lib/monitoring/diff";
import { FREE_LIMITS } from "@/lib/scanner/scan";

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

      <section className="mx-auto max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pt-16">
        <nav aria-label="Breadcrumb" className="eyebrow">
          <Link href="/tools" className="hover:text-ink hover:underline">
            Tools
          </Link>{" "}
          / {t.paid ? "Monitoring" : "Free scan"}
        </nav>
        <h1 className="mt-4 max-w-4xl font-display text-[2.4rem] font-semibold leading-[1.06] tracking-tight sm:text-6xl">{t.h1}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{t.intro}</p>
        <div className="mt-10 max-w-3xl">
          <Scanner offer={offer} />
          <p className="mt-3 text-sm text-muted">
            Free, no account needed: up to {FREE_LIMITS.maxPages} pages, {FREE_LIMITS.maxDepth} clicks deep. The free report summarises every check, not
            only this one, and lists the top {offer.freeIssues} issues with fixes; the full issue list is {offer.price} one-time.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <section aria-labelledby="howto" className="border-t border-ink pt-10">
          <h2 id="howto" className="font-display text-3xl font-semibold">
            How to do it
          </h2>
          <ol className="mt-5 list-decimal space-y-2 pl-5 leading-relaxed text-ink-soft">
            {t.howTo.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>

        {t.alertKinds && (
          <section aria-labelledby="alerts" className="mt-14">
            <h2 id="alerts" className="font-display text-3xl font-semibold">
              When you get an email
            </h2>
            <p className="mt-3 leading-relaxed text-ink-soft">The first scan of a site is the baseline. After that, ChangeKite emails you when:</p>
            <ul className="mt-4 space-y-2 text-ink-soft">
              {t.alertKinds.map((k) => (
                <li key={k} className="border-l border-rule pl-3">
                  {ALERT_LABELS[k]}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="checks" className="mt-14">
          <h2 id="checks" className="font-display text-3xl font-semibold">
            What the {docs.length === 1 ? "check looks" : "checks look"} at
          </h2>
          <div className="mt-5 divide-y divide-rule border-y border-rule">
            {docs.map((d) => (
              <div key={d.id} className="py-6">
                <h3 className="font-semibold">
                  <Link href={`/docs#${d.id}`} className="hover:underline">
                    {d.title}
                  </Link>
                </h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{d.why}</p>
                <ul className="mt-3 space-y-1.5 text-[0.95rem] leading-relaxed text-ink-soft">
                  {d.how.map((h) => (
                    <li key={h} className="border-l border-rule pl-3">
                      {h}
                    </li>
                  ))}
                </ul>
                <ul className="mt-3 space-y-1 text-sm text-muted">
                  {d.severities.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="watch" className="mt-14 border border-ink bg-sheet p-6 sm:p-8">
          <h2 id="watch" className="font-display text-2xl font-semibold">
            {t.paid ? "Start monitoring" : "Want to know when it breaks again?"}
          </h2>
          <p className="mt-3 leading-relaxed text-ink-soft">
            Paid plans re-scan the sites you look after on a schedule and email you only when something changes. {PLAN_SUMMARY}. Cancel any time.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/signup" className={primaryButton}>
              Create an account
            </Link>
            <Link href="/pricing" className={secondaryButton}>
              See plans from {FROM_PRICE}
            </Link>
          </div>
        </section>

        <section aria-labelledby="faq" className="mt-14">
          <h2 id="faq" className="font-display text-3xl font-semibold">
            Questions
          </h2>
          <dl className="mt-5 divide-y divide-rule border-y border-rule">
            {t.faq.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-2 leading-relaxed text-ink-soft">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="more" className="mt-14">
          <h2 id="more" className="font-display text-2xl font-semibold">
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
