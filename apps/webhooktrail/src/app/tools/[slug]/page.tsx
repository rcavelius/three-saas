import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";
import { JsonLd } from "@/components/JsonLd";
import { TOOLS, getTool, replayFromPrice, replayPassNote, replayPlanNames } from "@/content/tools";
import { CATALOG } from "@/lib/plans";

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
    <div className="mx-auto w-full max-w-[78ch] px-4 py-14">
      <p className="label">
        <Link href="/tools" className="hover:text-fg">
          Tools
        </Link>
      </p>
      <h1 className="mt-3 wt-display text-[36px] md:text-[52px]">{t.h1}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{t.intro}</p>

      <section aria-label="Get started" className="mt-6 border border-line rounded-[14px] bg-surface p-5">
        <p className="font-mono text-[12px] text-fg-dim">
          uses · <span className="text-signal">{t.featureName}</span>
          {paidOnly ? ` · ${replayPlanNames} plans, from ${replayFromPrice}${replayPassNote ? `, or ${replayPassNote}` : ""}` : " · free, no account needed"}
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {paidOnly ? (
            <>
              <Link className="btn btn-signal h-11 px-5 text-[15px]" href="/signup">
                Sign up <span aria-hidden className="font-mono">→</span>
              </Link>
              <Link className="btn h-11 px-5 text-[15px]" href="/pricing">
                See pricing
              </Link>
            </>
          ) : (
            <>
              <CreateEndpointButton />
              <Link className="btn h-11 px-5 text-[15px]" href="/pricing">
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
      </section>

      <article className="prose-doc mt-10">
        <h2>How to do it</h2>
        <ol className="list-decimal pl-5 my-3 grid gap-1">
          {t.howTo.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        <h2>Questions</h2>
        {t.faq.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}

        <h2>Read more</h2>
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

      <section aria-labelledby="more" className="mt-12 border-t border-line pt-6">
        <h2 id="more" className="label">
          More webhook tools
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {others.map((o) => (
            <li key={o.slug}>
              <Link
                href={`/tools/${o.slug}`}
                className="inline-block rounded-[4px] border border-line px-2.5 py-1 text-[13px] text-fg-muted hover:text-fg hover:border-line-strong"
              >
                {o.h1}
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

