import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/PageHero";
import { GUIDES, getGuide } from "@/content/guides";
import { templatesForGuide } from "@/content/templates";
import { TemplateStrip } from "@/components/templates/TemplateStrip";
import { appUrl } from "@/lib/site";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  return g ? pageMeta({ title: g.title, description: g.summary, path: `/guides/${g.slug}`, type: "article" }) : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  return (
    <article>
      <PageHero
        narrow
        eyebrow={
          <Link href="/guides" className="hover:underline">
            Guides
          </Link>
        }
        title={guide.title}
      >
        {guide.summary}
      </PageHero>
      <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-8 sm:py-14">
        <div className="prose-doc card-pop px-5 py-4 text-[17px] sm:px-8 sm:py-6">{guide.body}</div>
        <div className="card-pop mt-10 flex flex-col items-start gap-4 bg-mint-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-[19px] font-extrabold">Fix it in your own file, free, in your browser.</p>
          <Link href="/#start" className="btn-pop">
            Clean my spreadsheet
          </Link>
        </div>
        <TemplateStrip templates={templatesForGuide(guide.slug)} heading="Templates for this data" intro="Ready-made Excel and Google Sheets workbooks to put the cleaned data to work. Pay once, download right away." />
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.summary,
          url: `${appUrl()}/guides/${guide.slug}`,
          publisher: { "@type": "Organization", name: "GridRinse" },
        }}
      />
    </article>
  );
}
