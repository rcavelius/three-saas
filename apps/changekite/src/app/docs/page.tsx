import type { Metadata } from "next";
import Link from "next/link";
import { CHECK_DOCS } from "@/lib/check-docs";
import { SCORE_RULES } from "@/lib/scanner/score";
import { SkyHero } from "@/components/ui";

export const metadata: Metadata = {
  title: "What we check",
  description: "How each ChangeKite check works, why it matters, and how findings are graded.",
  alternates: { canonical: "/docs" },
};

export default function DocsPage() {
  return (
    <>
    <SkyHero
      title="What we check, and how"
      lede="Every finding comes from one of these twelve checks, graded critical (fix now), warning (should fix) or notice (worth knowing)."
    />
    <div className="mx-auto max-w-6xl px-5 pt-14 sm:px-8 sm:pt-20">
      <div className="grid gap-12 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Checks" className="lg:sticky lg:top-6 lg:self-start">
          <ol className="space-y-1 text-[0.95rem] font-semibold">
            {CHECK_DOCS.map((c) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="text-ink-soft hover:text-ink hover:underline">
                  {c.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#score" className="text-ink-soft hover:text-ink hover:underline">
                The score
              </a>
            </li>
          </ol>
        </nav>

        <div className="min-w-0">
          {CHECK_DOCS.map((c) => (
            <section key={c.id} id={c.id} aria-labelledby={`${c.id}-h`} className="mb-4 scroll-mt-6 rounded-[28px] bg-white p-6 sm:p-9">
              <h2 id={`${c.id}-h`} className="font-display text-[1.75rem] leading-tight sm:text-[2.25rem]">
                {c.title}
              </h2>
              <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-ink">{c.why}</p>
              <div className="mt-6 grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="text-[0.95rem] font-extrabold">How we check</h3>
                  <ul className="mt-3 space-y-2 text-[0.95rem] leading-relaxed text-ink-soft">
                    {c.how.map((h) => (
                      <li key={h} className="rounded-xl bg-paper px-3.5 py-2.5">
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-[0.95rem] font-extrabold">Grading</h3>
                  <ul className="mt-3 space-y-2 text-[0.95rem] leading-relaxed text-ink-soft">
                    {c.severities.map((s) => (
                      <li key={s} className="rounded-xl bg-paper px-3.5 py-2.5">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ))}

          <section id="score" aria-labelledby="score-h" className="scroll-mt-6 rounded-[28px] bg-sky p-6 text-white sm:p-9 [&_.prose-doc_p]:text-white [&_.prose-doc_a]:text-white">
            <h2 id="score-h" className="font-display text-[1.75rem] leading-tight sm:text-[2.25rem]">The score</h2>
            <div className="prose-doc max-w-2xl">
              <p>
                The score starts at 100. Each critical finding costs {SCORE_RULES.critical.points} points (at most{" "}
                {SCORE_RULES.critical.cap} in total), each warning {SCORE_RULES.warning.points} (at most {SCORE_RULES.warning.cap}) and each notice{" "}
                {SCORE_RULES.notice.points} (at most {SCORE_RULES.notice.cap}). The caps stop one noisy category from hiding everything else.
              </p>
              <p>
                A site is &ldquo;in good order&rdquo; at 85 or more with no critical findings. The number is a summary of one
                scan, not a ranking factor and not a promise about search results.
              </p>
              <p>
                <Link href="/">Run an inspection</Link> to see it for your site.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
    </>
  );
}
