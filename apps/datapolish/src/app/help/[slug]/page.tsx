import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpMarkdown } from "@repo/support/ui";
import { JsonLd } from "@/components/JsonLd";
import { getPlatform } from "@/server/platform";

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
  return (
    <div className="sup-root mx-auto max-w-[900px] px-4 py-10 sm:px-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: a.title,
          description: a.summary,
          dateModified: a.updated_on,
          mainEntityOfPage: `${p.env.appUrl}/help/${a.slug}`,
          publisher: { "@type": "Organization", name: "DataPolish" },
        }}
      />
      <nav aria-label="Breadcrumb" className="text-sm text-ink-3">
        <Link href="/help" className="underline">
          Help center
        </Link>{" "}
        / {a.category}
      </nav>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{a.title}</h1>
      <p className="mt-3 max-w-[65ch] text-ink-2">{a.summary}</p>
      <p className="mt-1 text-sm text-ink-3">Updated {a.updated_on}</p>
      <article className="mt-8 max-w-[70ch]">
        <HelpMarkdown markdown={a.body} />
      </article>
      <p className="mt-10 border-t border-rule pt-5 text-ink-2">
        Still stuck?{" "}
        <Link href="/support" className="text-accent underline">
          Ask the assistant or contact a person
        </Link>
        .
      </p>
    </div>
  );
}
