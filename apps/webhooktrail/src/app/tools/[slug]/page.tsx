import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";
import { JsonLd } from "@/components/JsonLd";
import { TOOLS, getTool, replayFromPrice, replayPassNote, replayPlanNames } from "@/content/tools";
import { CATALOG } from "@/lib/plans";
import { PageHead } from "@/components/grid/PageHead";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getTool(slug);
  if (!t) return { title: "Not found", robots: { index: false } };
  return {
    title: t.title,
    description: t.description,
    alternates: { canonical: `/tools/${t.slug}` },
    openGraph: { type: "website", title: t.h1, description: t.description, url: `/tools/${t.slug}` },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getTool(slug);
  if (!t) notFound();
  const others = TOOLS.filter((o) => o.slug !== t.slug);
  const base = (process.env.APP_URL || "http://localhost:3003").replace(/\/$/, "");
  const url = `${base}/tools/${t.slug}`;
  const paidOnly = t.feature === "replay";

  return (
    <div className="g-frame">
      <PageHead
        word="Tools"
        wordHref="/tools"
        title={t.h1}
        lead={<p>{t.intro}</p>}
        aside={
          <div className="w-full self-stretch font-mono">
            <p className="text-[12px] leading-[18px] text-fg-dim">
              uses · <span className="text-signal">{t.featureName}</span>
              {paidOnly ? ` · ${replayPlanNames} plans, from ${replayFromPrice}${replayPassNote ? `, or ${replayPassNote}` : ""}` : " · free, no account needed"}
            </p>
        <div className="mt-4 flex flex-wrap items-start gap-3">
            {paidOnly ? (
              <>
                <Link className="btn-cut" href="/signup">
                  Sign up <span aria-hidden className="arr">→</span>
                </Link>
                <Link className="btn-cut btn-cut-ghost" href="/pricing">
                  See pricing
                </Link>
              </>
            ) : (
              <>
                <CreateEndpointButton />
                <Link className="btn-cut btn-cut-ghost" href="/pricing">
                  See pricing
                </Link>
              </>
            )}
          </div>
          {paidOnly && (
            <div className="mt-4 grid gap-2">
              <p className="text-[13px] text-fg-muted">Capturing requests is free. Start with an endpoint, upgrade when you need replay:</p>
              <CreateEndpointButton size="sm" />
            </div>
          )}
          </div>
        }
      />

      <div className="g-row grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="g-x hidden p-4 md:p-6 lg:block">
          <p className="g-cap text-fg-dim">On this page</p>
          <ul className="mt-3 grid gap-2 font-mono text-[13px]">
            <li><a className="hover:text-signal" href="#how">How to do it</a></li>
            <li><a className="hover:text-signal" href="#questions">Questions</a></li>
            <li><a className="hover:text-signal" href="#read">Read more</a></li>
          </ul>
        </div>
        <div className="g-x px-4 pb-10 md:px-8">
      <article className="prose-doc">
        <h2 id="how">How to do it</h2>
        <ol className="list-decimal pl-5 my-3 grid gap-1">
          {t.howTo.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        <h2 id="questions">Questions</h2>
        {t.faq.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}

        <h2 id="read">Read more</h2>
        <ul>
          {t.links.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label}</Link>
            </li>
          ))}
          <li>
            <Link href="/pricing">Pricing: Free, {CATALOG.plans.filter((p) => p.priceMonthlyCents > 0).map((p) => p.name).join(" and ")}</Link>
          </li>
          <li>
            <Link href="/signup">Create an account to keep endpoints in a workspace</Link>
          </li>
        </ul>
      </article>

      </div>
      </div>

      <section aria-labelledby="more" className="mt-12 border-t border-line md:mt-16">
        <h2 id="more" className="border-b border-line px-4 py-4 font-[family-name:var(--font-pixel)] text-[26px] font-bold uppercase leading-none md:px-5 md:text-[34px]">
          More tools
        </h2>
        <ul className="g-row grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/tools/${o.slug}`} className="g-link flex min-h-[52px] items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-semibold md:px-5">
                {o.h1}
                <span aria-hidden="true" className="arr">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              name: "WebhookTrail",
              url,
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any (web browser)",
              offers: CATALOG.plans.map((p) => ({
                "@type": "Offer",
                name: p.name,
                price: (p.priceMonthlyCents / 100).toFixed(2),
                priceCurrency: "USD",
              })),
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
                { "@type": "ListItem", position: 1, name: "Tools", item: `${base}/tools` },
                { "@type": "ListItem", position: 2, name: t.h1, item: url },
              ],
            },
          ],
        }}
      />
    </div>
  );
}

