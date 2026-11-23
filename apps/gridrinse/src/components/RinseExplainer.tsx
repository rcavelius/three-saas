import { Art } from "@/components/Art";
import { explainerSpecimen } from "@/lib/hero-specimen";

/**
 * What GridRinse does, in one picture: a messy export (problems in red) → the rinse → the same rows clean (fixes in
 * green). Real HTML tables; the "after" side is the engine's real output (see explainerSpecimen). The clean rows
 * land one by one (CSS only); with reduced motion everything is simply shown.
 */
export function RinseExplainer() {
  const { input, output, rowOrigins, removedRows, changed } = explainerSpecimen();
  const bad = new Set(changed);
  const cell = "px-2 py-1.5 text-left sm:px-3 sm:py-2";
  const head = (cols: string[], tint: string) => (
    <thead>
      <tr className={tint}>
        {cols.map((c) => (
          <th key={c} scope="col" className={`${cell} border-b-[3px] border-ink font-extrabold`}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
  return (
    <figure className="ink-zone grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_200px_minmax(0,1fr)] lg:gap-2" aria-labelledby="explainer-caption">
      <div className="min-w-0">
        <p className="chip mb-3 !bg-pink !text-ink">Messy CSV / Excel in</p>
        <div className="card-pop overflow-hidden">
          <table className="w-full border-collapse whitespace-nowrap text-[13px] font-semibold sm:text-[16px]" aria-label="Before: the messy export">
            {head(input.columns, "bg-sunken")}
            <tbody>
              {input.rows.map((row, r) => {
                const dup = removedRows.includes(r);
                return (
                  <tr key={r} className={dup ? "bg-rose" : ""}>
                    {row.map((v, c) => (
                      <td
                        key={c}
                        className={`${cell} border-b-2 border-rule ${dup ? "text-del-ink line-through decoration-2" : bad.has(`${r}:${c}`) ? "bg-rose text-del-ink" : ""}`}
                      >
                        {v.replace(/^ +| +$/g, (s) => "·".repeat(s.length))}
                        {dup && c === row.length - 1 && <span className="ml-2 inline-block rounded-full bg-del-ink px-2 py-0.5 text-[11px] font-extrabold text-white no-underline">duplicate</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 lg:flex-col lg:gap-1" aria-hidden="true">
        <Art name="mascot" className="float hidden h-auto w-[180px] lg:block" />
        <span className="rinse-arrow flex items-center gap-2 rounded-full border-[3px] border-ink bg-mint px-4 py-1.5 text-[16px] font-extrabold shadow-[3px_3px_0_#0a0a0a]">
          Rinse
          <svg className="rotate-90 lg:rotate-0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>

      <div className="min-w-0">
        <p className="chip mb-3 !bg-mint !text-ink">Clean file out, in your browser</p>
        <div className="card-pop overflow-hidden">
          <table className="w-full border-collapse whitespace-nowrap text-[13px] font-semibold sm:text-[16px]" aria-label="After: the cleaned rows">
            {head(output.columns, "bg-mint")}
            <tbody>
              {output.rows.map((row, i) => (
                <tr key={i} className="rinse-row" style={{ animationDelay: `${700 + i * 420}ms` }}>
                  {row.map((v, c) => (
                    <td key={c} className={`${cell} border-b-2 border-rule ${bad.has(`${rowOrigins[i]}:${c}`) ? "bg-mint-soft text-ok" : ""}`}>
                      {v === "" ? <span className="text-[12px] font-bold text-ink-3 sm:text-[13px]">blank</span> : v}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td colSpan={output.columns.length} className={`${cell} rinse-row font-extrabold text-ok`} style={{ animationDelay: `${700 + output.rows.length * 420}ms` }}>
                  ✓ 1 duplicate removed · {changed.length} cells fixed
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <figcaption id="explainer-caption" className="sr-only">
        How GridRinse works: a messy export with stray spaces, a duplicate row, dates in four formats, N/A and currency symbols goes in; the same
        rows come out clean, with one date format, plain numbers, the duplicate removed and N/A left blank. It all happens in your browser.
      </figcaption>
    </figure>
  );
}
