import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpMarkdown } from "@repo/support/ui";
import { JsonLd } from "@/components/JsonLd";
import { getPlatform } from "@/lib/platform";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await (await getPlatform()).support.getArticle((await params).slug);
  if (!a) return { title: "Not found", robots: { index: false } };
  return { title: a.title, description: a.summary, alternates: { canonical: `/help/${a.slug}` }, openGraph: { type: "article", title: a.title, description: a.summary } };
}

export default async function HelpArticlePage({ params }: Props) {
  const p = await getPlatform();
  const a = await p.support.getArticle((await params).slug);
  if (!a) notFound();
  const url = `${new URL(p.env.APP_URL).origin}/help/${a.slug}`;
  return (
    <div className="sup-root mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: a.title,
          description: a.summary,
          dateModified: a.updated_on,
          mainEntityOfPage: url,
          publisher: { "@type": "Organization", name: "ChangeKite" },
        }}
      />
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/help" className="underline">
          Help center
        </Link>{" "}
        / {a.category}
      </nav>
      <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">{a.title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">{a.summary}</p>
      <p className="mt-2 text-sm text-muted">Updated {a.updated_on}</p>
      <article className="mt-8">
        <HelpMarkdown markdown={a.body} />
      </article>
      <p className="mt-12 border-t border-rule pt-6 text-ink-soft">
        Still stuck? <Link href="/support" className="text-accent underline">Ask the assistant or contact a person</Link>.
      </p>
    </div>
  );
}
