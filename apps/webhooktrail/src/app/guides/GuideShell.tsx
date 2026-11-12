import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import type { Guide } from "./guides";

export function GuideShell({ guide, steps, children }: { guide: Guide; steps?: string[]; children: React.ReactNode }) {
  const origin = process.env.APP_URL || "http://localhost:3003";
  return (
    <div className="mx-auto w-full max-w-[78ch] px-4 py-14">
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
      <p className="label">
        <Link href="/guides" className="hover:text-fg">
          Guides
        </Link>
      </p>
      <article className="prose-doc mt-3">
        <h1 className="text-[30px] font-semibold tracking-[-0.02em]">{guide.title}</h1>
        <p className="font-mono text-[12px] !text-fg-dim">Updated {guide.updated}</p>
        {children}
      </article>
    </div>
  );
}
