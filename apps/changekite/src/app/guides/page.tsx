import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import { SkyHero } from "@/components/ui";

export const metadata: Metadata = {
  title: "Guides",
  description: "Short, practical guides to the website problems ChangeKite finds: broken links, expiring certificates and robots.txt mistakes.",
  alternates: { canonical: "/guides" },
};

const TONES = ["bg-kite text-night", "bg-ink text-white", "bg-sky-pale text-ink"];

export default function GuidesPage() {
  return (
    <>
      <SkyHero title="Fixing what the report finds" lede="Short, practical write-ups of the problems that hurt sites most often." wide />
      <div className="mx-auto max-w-[1360px] px-5 pt-20 md:px-8 lg:px-12 lg:pt-28">
        <h2 className="sr-only">All guides</h2>
        <ul className="grid gap-4 lg:grid-cols-3">
          {GUIDES.map((g, i) => (
            <li key={g.slug} className="ck-reveal" style={{ ["--d" as string]: `${i * 80}ms` }}>
              <Link href={`/guides/${g.slug}`} className={`ck-lift group flex h-full min-h-[340px] flex-col justify-between gap-8 rounded-[28px] p-7 sm:p-9 ${TONES[i % 3]}`}>
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
