import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { GUIDES, getGuide } from "@/content/guides";
import { appUrl } from "@/lib/site";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  return g ? { title: g.title, description: g.summary, alternates: { canonical: `/guides/${g.slug}` }, openGraph: { type: "article", title: g.title, description: g.summary } } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  return (
    <article className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
      <p className="eyebrow">
        <Link href="/guides" className="hover:text-ink">
          Guides
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight">{guide.title}</h1>
      <p className="mt-3 text-[15px] text-ink-2">{guide.summary}</p>
      <div className="prose-doc mt-6 border-t border-rule pt-2">{guide.body}</div>
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
