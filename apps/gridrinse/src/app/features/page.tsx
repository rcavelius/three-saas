import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { ReviewToggle } from "@/components/ReviewToggle";
import { RinseCard } from "@/components/RinseCard";
import { Shield } from "@/components/Shield";
import { featureSpecimens } from "@/lib/feature-specimens";

export const metadata: Metadata = pageMeta({
  title: "Features",
  description: "Trim spaces, remove duplicate and blank rows, standardize dates, turn currency text into numbers, and review every change. All in your browser.",
  path: "/features",
});

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg className={`shrink-0 ${down ? "mx-auto my-1 rotate-90" : ""}`} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

function Chip({ value, after }: { value: string; after?: boolean }) {
  return (
    <span className={`min-w-0 flex-1 whitespace-pre rounded-lg border-2 border-ink px-3 py-2 text-center font-mono text-[15px] sm:text-[16px] ${after ? "bg-mint-soft" : "bg-surface"}`}>
      {value}
    </span>
  );
}

function ValueDemo({ before, after, label }: { before: string; after: string; label: string }) {
  return (
    <p className="mt-auto flex items-center gap-3 pt-5" aria-label={`${label}: ${before.trim()} becomes ${after}`}>
      <Chip value={before} />
      <Arrow />
      <Chip value={after} after />
    </p>
  );
}

function Grid({ columns, rows, tint, numbered }: { columns: string[]; rows: { cells: string[]; mark?: string }[]; tint?: string; numbered?: boolean }) {
  return (
    <table className={`w-full border-collapse text-[13px] sm:text-[14px] ${tint ?? ""}`}>
      <thead>
        <tr className="bg-sunken">
          {numbered && <th className="w-6 border border-ink" aria-hidden="true" />}
          {columns.map((c) => (
            <th key={c} scope="col" className="border border-ink px-2 py-1 text-left font-bold">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.mark ?? ""}>
            {numbered && <td className="border border-ink bg-sunken px-1 text-center text-[12px] font-bold">{i + 1}</td>}
            {r.cells.map((c, j) => (
              <td key={j} className="h-7 border border-ink px-2 py-1 font-medium whitespace-nowrap">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Card({ title, body, tint, children }: { title: string; body: string; tint: string; children: React.ReactNode }) {
  return (
    <li className="card-pop flex flex-col overflow-hidden">
      <h3 className={`border-b-[3px] border-ink px-5 py-3 text-[22px] font-extrabold tracking-[-0.02em] sm:text-[24px] ${tint}`}>{title}</h3>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
        <p className="text-[16px] font-medium leading-snug text-ink-2">{body}</p>
        {children}
      </div>
    </li>
  );
}

export default function Features() {
  const s = featureSpecimens();
  return (
    <>
      <section className="mint-grid overflow-hidden">
        <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 pb-14 pt-8 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <p className="chip rise">Features</p>
            <h1 className="display display-out mt-5 text-[clamp(3rem,12vw,6.2rem)] leading-[0.92] [animation-delay:60ms] lg:text-[clamp(3.4rem,5.4vw,5.4rem)]">
              A cleaner sheet. <br />
              No manual work.
            </h1>
            <p className="rise mt-5 max-w-[36rem] text-[18px] font-semibold leading-snug [animation-delay:120ms] sm:text-[21px]">Fix the everyday details that get between you and usable data.</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link href="/how-it-works" className="btn-pop">
                Clean my spreadsheet
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 12h15M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link href="/how-it-works?sample=1" className="text-[18px] font-extrabold underline decoration-[3px] underline-offset-[5px]">
                Try a sample
              </Link>
            </div>
          </div>
          <RinseCard />
        </div>
      </section>

      <section aria-labelledby="all-features" className="mx-auto max-w-[1400px] px-4 py-12 sm:px-8 sm:py-16">
        <h2 id="all-features" className="display text-[clamp(2.6rem,7vw,4.6rem)]">
          Everything you need for a fresh start.
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Card title="Trim extra spaces" body="Remove leading, trailing, and extra spaces so text is clean and consistent." tint="bg-mint-soft">
            <ValueDemo label="Trim" before={s.trim.before} after={s.trim.after} />
          </Card>
          <Card title="Remove duplicate rows" body="Find and remove repeated rows, keeping just one clean copy." tint="bg-lemon-soft">
            <div className="mt-4">
              <Grid columns={s.dedupe.input.columns} rows={s.dedupe.input.rows.map((cells) => ({ cells, mark: "bg-rose" }))} />
              <Arrow down />
              <Grid columns={s.dedupe.output.columns} rows={s.dedupe.output.rows.map((cells) => ({ cells, mark: "bg-mint-soft" }))} />
            </div>
          </Card>
          <Card title="Drop empty rows" body="Remove rows that are completely blank so your data stays focused." tint="bg-sky-soft">
            <div className="mt-4 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Grid numbered columns={s.blank.input.columns} rows={s.blank.input.rows.map((cells, i) => ({ cells, mark: s.blank.removedRows.includes(i) ? "bg-rose" : "" }))} />
              </div>
              <Arrow />
              <div className="min-w-0 flex-1">
                <Grid columns={s.blank.output.columns} rows={s.blank.output.rows.map((cells) => ({ cells }))} />
              </div>
            </div>
          </Card>
          <Card title="Standardize dates" body="Convert common date formats to a single, clear format (YYYY-MM-DD) when unambiguous." tint="bg-lemon-soft">
            <ValueDemo label="Dates" before={s.date.before} after={s.date.after} />
          </Card>
          <Card title="Turn text into numbers" body="Convert currency values to numeric format so they're ready for analysis." tint="bg-sky-soft">
            <ValueDemo label="Numbers" before={s.number.before} after={s.number.after} />
          </Card>
          <Card title="Review every change" body="See what will change before you download, so you're always in control." tint="bg-mint-soft">
            <div className="mt-4">
              <ReviewToggle columns={s.review.input.columns} before={s.review.input.rows[0]!} after={s.review.output.rows[0]!} />
            </div>
          </Card>
        </ul>

        <div className="mt-12 flex flex-col gap-5 rounded-[12px] border-2 border-ink bg-accent px-6 py-6 text-white sm:px-8 lg:flex-row lg:items-center lg:gap-8">
          <p className="display text-[2rem] sm:text-[2.5rem]">Your data stays on your device.</p>
          <span className="hidden h-14 w-0.5 bg-white/40 lg:block" aria-hidden="true" />
          <p className="flex items-center gap-4 text-[17px] font-medium sm:text-[19px]">
            <Shield size={40} />
            Files are processed in your browser, never uploaded.
          </p>
          <span className="hidden h-14 w-0.5 bg-white/40 lg:block" aria-hidden="true" />
          <p className="rounded-lg border-2 border-ink bg-lemon px-5 py-3 text-[17px] font-extrabold text-ink lg:ml-auto">Ambiguous dates are flagged, never guessed.</p>
        </div>
      </section>
    </>
  );
}
