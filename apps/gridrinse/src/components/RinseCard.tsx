import { heroSpecimen } from "@/lib/hero-specimen";

/**
 * The homepage's picture of the product: a messy export and the same rows after the real engine has run on them
 * (see hero-specimen.ts). A lime squeegee wipes across once and reveals the clean table while the meter fills.
 * CSS only: without motion (or script) the card simply shows the clean result.
 */
export function RinseCard() {
  const { input, output, removedRows, notes, changedCells } = heroSpecimen();
  const changed = new Set(changedCells.map(([r, c]) => `${r}:${c}`));
  const cell = "px-2.5 py-2 sm:px-3.5 sm:py-2.5 text-left";
  return (
    <figure className="rinse-card ink-zone relative min-w-0" aria-label="Example: a messy export and the cleaned result">
      <div className="card-pop relative overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b-[3px] border-ink bg-ink px-4 py-2.5 text-white">
          <span className="truncate text-[15px] font-bold sm:text-[17px]">customer_export.csv</span>
          <span className="rinse-tag relative shrink-0 text-[14px] font-extrabold uppercase sm:text-[15px]">
            <span className="rinse-tag-before">Messy</span>
            <span className="rinse-tag-after absolute inset-0 text-mint">Rinsed</span>
          </span>
        </div>

        <div className="relative">
          {/* Before: the rows as exported. */}
          <table className="w-full border-collapse whitespace-nowrap text-[14px] font-semibold sm:text-[18px]" aria-label="Before">
            <thead>
              <tr className="bg-sunken">
                {input.columns.map((c) => (
                  <th key={c} scope="col" className={`${cell} border-b-[3px] border-ink font-extrabold`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {input.rows.map((row, r) => (
                <tr key={r} className={removedRows.includes(r) ? "bg-rose line-through decoration-del-ink decoration-2" : ""}>
                  {row.map((v, c) => (
                    <td key={c} className={`${cell} border-b-2 border-rule ${changed.has(`${r}:${c}`) ? "bg-rose text-del-ink" : ""}`}>
                      {v.replace(/ $/, "␣")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* After: what the engine returned, wiped in over the top. */}
          <div className="rinse-after absolute inset-0 bg-surface">
            <table className="w-full border-collapse whitespace-nowrap text-[14px] font-semibold sm:text-[18px]" aria-label="After">
              <thead>
                <tr className="bg-mint">
                  {output.columns.map((c) => (
                    <th key={c} scope="col" className={`${cell} border-b-[3px] border-ink font-extrabold`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {output.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((v, c) => (
                      <td key={c} className={`${cell} border-b-2 border-rule`}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {notes.length > 0 && <p className="px-3 py-2 text-[14px] font-extrabold sm:px-3.5 sm:py-2.5 sm:text-[16px]">✓ {notes.join(" · ")}</p>}
          </div>

          <span className="rinse-blade pointer-events-none absolute inset-0" aria-hidden="true">
            <span className="absolute inset-y-0 right-0 w-3.5 border-x-[3px] border-ink bg-mint" />
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3" aria-hidden="true">
        <div className="relative h-11 flex-1 overflow-hidden rounded-full border-[3px] border-ink bg-surface shadow-[4px_4px_0_#0a0a0a]">
          <span className="rinse-meter absolute inset-0 origin-left bg-mint" />
          <span className="display relative flex h-full items-center justify-center text-[22px] tracking-[0.02em] sm:text-[24px]">Clean 100%</span>
        </div>
      </div>
      <figcaption className="sr-only">
        Before: {input.rows.length} rows with mixed date formats, money symbols and a duplicate. After GridRinse&apos;s default steps: {output.rows.length} clean rows. {notes.join(". ")}.
      </figcaption>
    </figure>
  );
}
