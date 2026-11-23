import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import type { Guide } from "./guides";
import { PageHead } from "@/components/grid/PageHead";

export function GuideShell({ guide, steps, children }: { guide: Guide; steps?: string[]; children: React.ReactNode }) {
  const origin = process.env.APP_URL || "http://localhost:3003";
  return (
    <div className="g-frame">
      <JsonLd
        data={
          steps
            ? {
                "@context": "https://schema.org",
                "@type": "HowTo",
                name: guide.title,
                description: guide.description,
                step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, text: s })),
              }
            : {
                "@context": "https://schema.org",
                "@type": "Article",
                headline: guide.title,
                description: guide.description,
                dateModified: guide.updated,
                mainEntityOfPage: `${origin}/guides/${guide.slug}`,
                publisher: { "@type": "Organization", name: "WebhookTrail" },
              }
        }
      />
      <PageHead word="Guides" wordHref="/guides" title={guide.title} art="hook" lead={<><p>{guide.description}</p><p className="mt-3 font-mono text-[12px] text-fg-dim">Updated {guide.updated}</p></>} />
      <div className="g-row grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="g-x hidden p-4 md:p-6 lg:block">
          <Link href="/guides" className="g-cap hover:text-signal">
            ← All guides
          </Link>
        </div>
        <article className="prose-doc g-x px-4 pb-12 md:px-8">{children}</article>
      </div>
    </div>
  );
}
