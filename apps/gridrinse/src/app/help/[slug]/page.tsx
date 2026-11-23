import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { notFound } from "next/navigation";
import { HelpMarkdown } from "@repo/support/ui";
import { JsonLd } from "@/components/JsonLd";
import { getPlatform } from "@/server/platform";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await (await getPlatform()).support.getArticle((await params).slug);
  if (!a) return { title: "Not found", robots: { index: false } };
  return pageMeta({ title: a.title, description: a.summary, path: `/help/${a.slug}`, type: "article" });
}

export default async function HelpArticlePage({ params }: Props) {
  const p = await getPlatform();
  const a = await p.support.getArticle((await params).slug);
  if (!a) notFound();
  return (
    <div className="sup-root">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: a.title,
          description: a.summary,
          dateModified: a.updated_on,
          mainEntityOfPage: `${p.env.appUrl}/help/${a.slug}`,
          publisher: { "@type": "Organization", name: "GridRinse" },
        }}
      />
      <PageHero
        narrow
        eyebrow={
          <nav aria-label="Breadcrumb">
            <Link href="/help" className="!text-ink">
              Help center
            </Link>{" "}
            / {a.category}
          </nav>
        }
        title={a.title}
      >
        <p>{a.summary}</p>
        <p className="mt-2 text-[15px]">Updated {a.updated_on}</p>
      </PageHero>
      <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-8 sm:py-14">
      <article className="card-pop max-w-[70ch] px-5 py-6 text-[17px] leading-relaxed sm:px-8 sm:py-8">
        <HelpMarkdown markdown={a.body} />
      </article>
      <p className="mt-10 text-[17px] font-medium">
        Still stuck?{" "}
        <Link href="/support" className="text-accent underline">
          Ask the assistant or contact a person
        </Link>
        .
      </p>
      </div>
    </div>
  );
}
