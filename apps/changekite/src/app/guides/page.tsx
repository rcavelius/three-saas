import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import { PageHero } from "@/components/ui";

export const metadata: Metadata = {
  title: "Guides",
  description: "Short, practical guides to the website problems ChangeKite finds: broken links, expiring certificates and robots.txt mistakes.",
  alternates: { canonical: "/guides" },
};

const TONES = ["bg-orange text-ink", "bg-cyan text-ink", "bg-green text-ink", "bg-pink text-ink"];

export default function GuidesPage() {
  return (
    <>
      <PageHero title="Fixing what the report finds" lede="Short, practical write-ups of the problems that hurt sites most often." tone="orange" art="/art/link.webp" wide />
      <div className="mx-auto max-w-[1360px] px-5 pt-20 md:px-8 lg:px-12 lg:pt-28">
        <h2 className="sr-only">All guides</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {GUIDES.map((g, i) => (
            <li key={g.slug} className="ck-reveal" style={{ ["--d" as string]: `${i * 80}ms` }}>
              <Link href={`/guides/${g.slug}`} className={`ck-lift group flex h-full min-h-[340px] flex-col justify-between gap-8 rounded-[32px] p-7 sm:p-9 ${TONES[i % TONES.length]}`}>
                <h3 className="font-display text-[1.875rem] leading-[1.08] sm:text-[2.25rem]">{g.title}</h3>
                <div>
                  <p className="text-[1.0625rem] leading-relaxed">{g.description}</p>
                  <p className="mt-5 font-bold">
                    Read the guide <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-12 text-lg text-ink-soft">
          What each check measures and how the score works: <Link className="font-bold text-accent underline" href="/docs">what we check</Link>.
        </p>
      </div>
    </>
  );
}
