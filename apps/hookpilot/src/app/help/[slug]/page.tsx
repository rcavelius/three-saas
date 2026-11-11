import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpMarkdown } from "@repo/support/ui";
import { JsonLd } from "@/components/JsonLd";
import { getPlatform } from "@/lib/platform";

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
    <div className="sup-root mx-auto w-full max-w-[860px] px-4 py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: a.title,
          description: a.summary,
          dateModified: a.updated_on,
          mainEntityOfPage: `${p.appUrl}/help/${a.slug}`,
          publisher: { "@type": "Organization", name: "HookPilot" },
        }}
      />
      <nav aria-label="Breadcrumb" className="text-[13px] text-fg-dim">
        <Link href="/help" className="underline hover:text-fg">
          Help center
        </Link>{" "}
        / {a.category}
      </nav>
      <h1 className="mt-2 text-[26px] font-semibold">{a.title}</h1>
      <p className="mt-2 text-fg-muted">{a.summary}</p>
      <p className="mt-1 text-[13px] text-fg-dim">Updated {a.updated_on}</p>
      <article className="mt-8 max-w-[72ch]">
        <HelpMarkdown markdown={a.body} />
      </article>
      <p className="mt-10 border-t border-line pt-5 text-fg-muted">
        Still stuck?{" "}
        <Link href="/support" className="text-signal underline">
          Ask the assistant or contact a person
        </Link>
        .
      </p>
    </div>
  );
}
