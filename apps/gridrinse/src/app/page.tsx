import Link from "next/link";
import { Cleaner } from "@/components/Cleaner";
import { CellText } from "@/components/DataGrid";
import { JsonLd } from "@/components/JsonLd";
import { runPipeline } from "@/lib/engine/pipeline";
import { makeStep } from "@/lib/engine/schema";
import { appUrl } from "@/lib/site";
import { freeProcessingLimits, softwareApplicationLd } from "@/server/plans";

/**
 * The specimen table is produced by the real engine at render time, so what it shows is exactly what
 * the cleaner does: nothing in it is hand-written output.
 */
function specimen() {
  const input = {
    columns: ["Customer", "Order date", "Signup", "Amount"],
    rows: [
      ["  Maria   Lopez", "Jan 17, 2024", "03/04/2023", "$1,234.50"],
      ["Ethan Clark", "1/15/2024", "05/06/2023", "(45.00)"],
      ["", "", "", ""],
      ["  Maria   Lopez", "Jan 17, 2024", "03/04/2023", "$1,234.50"],
    ],
  };
  const res = runPipeline(input, [
    makeStep({ type: "trim" }),
    makeStep({ type: "removeBlankRows" }),
    makeStep({ type: "dedupe" }),
    makeStep({ type: "formatDates" }),
    makeStep({ type: "formatNumbers", columns: ["Amount"], decimals: 2 }),
  ]);
  return { input, res };
}

export default function Home() {
  const { input, res } = specimen();
  const flagged = new Set(
    res.steps.flatMap((s) => ((s.report.details?.needsChoice as { column: string }[] | undefined) ?? []).map((n) => n.column)),
  );
  return (
    <>
      <section className="border-b border-rule bg-surface">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-10">
          <div className="flex flex-col justify-center">
            <p className="eyebrow">CSV · XLSX · in your browser</p>
            <h1 className="mt-2 max-w-[18ch] text-3xl font-semibold leading-[1.1] tracking-tight sm:text-[2.6rem]">Clean a messy spreadsheet in one pass.</h1>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
              Trim stray spaces, drop blank and duplicate rows, put every date in one format and turn <span className="font-mono text-[13px]">$1,234.50</span> into a number. You see every
              change before you download. Your file is read by this page and never uploaded.
            </p>
            <p className="mt-3 text-[13px] text-ink-3">
              Free, no account. <Link href="/guides/fix-excel-dates" className="text-accent underline underline-offset-2">Why dates go wrong</Link> ·{" "}
              <Link href="/privacy" className="text-accent underline underline-offset-2">How privacy works</Link>
            </p>
          </div>
          <figure className="min-w-0">
            <div className="overflow-x-auto border border-rule-strong">
              <table className="w-full border-collapse font-mono text-[12px]">
                <caption className="sr-only">Example: four input rows and what the default steps do to them</caption>
                <thead>
                  <tr className="bg-sunken text-left font-sans text-[11px] text-ink-2">
                    <th scope="col" className="border-b border-r border-rule px-2 py-1 font-semibold">
                      #
                    </th>
                    {input.columns.map((c) => (
                      <th key={c} scope="col" className="border-b border-r border-rule px-2 py-1 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {input.rows.map((row, r) => {
                    const outIndex = res.rowOrigins.indexOf(r);
                    const removed = outIndex === -1;
                    return (
                      <tr key={r} className={removed ? "bg-del/70 text-del-ink" : ""}>
                        <th scope="row" className="border-b border-r border-rule px-2 py-1 text-left font-normal text-ink-3">
                          {r + 1}
                        </th>
                        {row.map((cell, c) => {
                          const after = removed ? null : res.table.rows[outIndex]![c]!;
                          const changed = after !== null && after !== cell;
                          const col = input.columns[c]!;
                          return (
                            <td key={c} className={`border-b border-r border-rule px-2 py-1 align-top whitespace-pre ${changed ? "bg-mark" : ""}`}>
                              {removed ? (
                                <span className="line-through decoration-del-ink/50">{cell ? <CellText value={cell} reveal /> : "(blank)"}</span>
                              ) : changed ? (
                                <>
                                  <span className="block text-ink-3 line-through">
                                    <CellText value={cell} reveal />
                                  </span>
                                  <span className="block">{after}</span>
                                </>
                              ) : (
                                <span>
                                  {cell}
                                  {flagged.has(col) && <span className="ml-1 font-sans text-[10px] text-mark-edge">DMY or MDY?</span>}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <figcaption className="mt-2 text-[12px] leading-snug text-ink-3">
              Live output of the default steps. Row 3 is blank and row 4 repeats row 1, so both go. &ldquo;Signup&rdquo; could be 3 April or March 4, so it is flagged for you
              instead of guessed.
            </figcaption>
          </figure>
        </div>
      </section>
      <div className="pt-6">
        <Cleaner freeLimits={freeProcessingLimits()} />
      </div>
      <JsonLd data={softwareApplicationLd(appUrl())} />
    </>
  );
}
