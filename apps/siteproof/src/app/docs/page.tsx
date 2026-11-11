import type { Metadata } from "next";
import Link from "next/link";
import { CHECK_DOCS } from "@/lib/check-docs";
import { SCORE_RULES } from "@/lib/scanner/score";

export const metadata: Metadata = {
  title: "What we check",
  description: "How each SiteProof check works, why it matters, and how findings are graded.",
};

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <p className="eyebrow">Reference</p>
      <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        What we check, and how
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Every finding in a report comes from one of the checks below. Each one is graded critical (fix now: visitors or
        search engines are affected), warning (should fix) or notice (worth knowing).
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Checks" className="lg:sticky lg:top-6 lg:self-start">
          <ol className="num space-y-1.5 text-sm">
            {CHECK_DOCS.map((c, i) => (
              <li key={c.id}>
                <a href={`#${c.id}`} className="text-ink-soft hover:text-ink hover:underline">
                  <span className="text-muted">{String(i + 1).padStart(2, "0")}</span> {c.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#score" className="text-ink-soft hover:text-ink hover:underline">
                <span className="text-muted">&mdash;</span> The score
              </a>
            </li>
          </ol>
        </nav>

        <div className="min-w-0">
          {CHECK_DOCS.map((c, i) => (
            <section key={c.id} id={c.id} aria-labelledby={`${c.id}-h`} className="scroll-mt-6 border-t border-ink pb-10 pt-6 first:pt-0 first:border-t-0">
              <h2 id={`${c.id}-h`} className="flex items-baseline gap-3 font-display text-2xl font-semibold sm:text-3xl">
                <span className="num text-base font-normal text-muted">{String(i + 1).padStart(2, "0")}</span>
                {c.title}
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-ink-soft">{c.why}</p>
              <div className="mt-6 grid gap-8 md:grid-cols-2">
                <div>
                  <h3 className="eyebrow">How we check</h3>
                  <ul className="mt-3 space-y-2 text-[0.95rem] leading-relaxed text-ink-soft">
                    {c.how.map((h) => (
                      <li key={h} className="border-l border-rule pl-3">
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="eyebrow">Grading</h3>
                  <ul className="mt-3 space-y-2 text-[0.95rem] leading-relaxed text-ink-soft">
                    {c.severities.map((s) => (
                      <li key={s} className="border-l border-rule pl-3">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ))}

          <section id="score" aria-labelledby="score-h" className="scroll-mt-6 border-t border-ink pt-6">
            <h2 id="score-h" className="font-display text-2xl font-semibold sm:text-3xl">The score</h2>
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
  );
}
