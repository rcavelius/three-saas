import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocPage } from "@/components/DocPage";
import { JsonLd } from "@/components/JsonLd";
import { GUIDES, getGuide } from "@/lib/guides";
import { env } from "@/lib/env";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = getGuide((await params).slug);
  if (!g) return {};
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: { type: "article", title: g.title, description: g.description },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = getGuide((await params).slug);
  if (!g) notFound();
  const url = `${new URL(env().APP_URL).origin}/guides/${g.slug}`;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    dateModified: g.updated,
    datePublished: g.updated,
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: "SiteProof" },
    publisher: { "@type": "Organization", name: "SiteProof" },
  };
  const howTo = g.steps
    ? {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: g.title,
        description: g.description,
        step: g.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
      }
    : null;
  const others = GUIDES.filter((x) => x.slug !== g.slug);
  return (
    <>
      <JsonLd data={article} />
      {howTo && <JsonLd data={howTo} />}
      <DocPage eyebrow="Guide" title={g.title} lede={g.description}>
        {g.body}
        {g.steps && (
          <>
            <h2>Steps</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-soft">
              {g.steps.map((s) => (
                <li key={s.name}>
                  <strong className="text-ink">{s.name}.</strong> {s.text}
                </li>
              ))}
            </ol>
          </>
        )}
        <h2>Check your site</h2>
        <p>
          <Link href="/">Run a free inspection</Link> to see these problems on your own site, or <Link href="/pricing">monitor it</Link> to be told when
          they appear.
        </p>
        <p className="text-sm">
          More guides: {others.map((o, i) => (
            <span key={o.slug}>
              {i > 0 && " · "}
              <Link href={`/guides/${o.slug}`}>{o.title}</Link>
            </span>
          ))}
        </p>
      </DocPage>
    </>
  );
}
