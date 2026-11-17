import { heroSpecimen } from "@/lib/hero-specimen";

export function Shield({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z" />
    </svg>
  );
}

export function Check() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-ok)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="cleaned">
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

/** The tilted BEFORE card and the cleaned result, computed by the real engine (see hero-specimen.ts). */
export function SpecimenFigure({ compact = false }: { compact?: boolean }) {
  const { input, output, removedRows, notes } = heroSpecimen();
  return (
    <figure className={`relative min-w-0 ${compact ? "" : "lg:pt-4"}`} aria-label="Example: a messy export and the cleaned result">
      {!compact && (
        <p className="card-pop absolute -top-2 right-0 z-20 hidden items-center gap-2 rounded-xl px-4 py-2 text-[17px] font-bold sm:flex lg:top-12">
          <Shield /> Never uploaded
        </p>
      )}

      <div className="card-pop relative z-0 w-[92%] max-w-[27rem] -rotate-2 overflow-hidden sm:w-[70%]">
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink bg-lemon px-4 py-2">
          <span className="text-[19px] font-extrabold">BEFORE</span>
          <span className="truncate text-[15px] font-bold">customer_export.csv</span>
        </div>
        <div className="p-2.5">
          <table className="w-full border-collapse whitespace-nowrap text-[13px] sm:text-[15px]">
            <thead>
              <tr className="bg-sunken">
                {input.columns.map((c) => (
                  <th key={c} scope="col" className="border border-rule-strong px-2 py-1 text-left font-bold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {input.rows.map((row, r) => (
                <tr key={r} className={removedRows.includes(r) ? "bg-rose" : ""}>
                  {row.map((cell, c) => (
                    <td key={c} className={`border border-rule-strong px-2 py-1 font-medium ${c === 2 ? "text-right" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <svg className="absolute left-[2%] top-[215px] z-20 hidden h-24 w-28 lg:block" viewBox="0 0 110 100" fill="none" stroke="#111" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 4c-8 34 6 62 82 70" />
        <path d="m82 60 15 14-16 12" />
      </svg>
      <svg className="absolute left-0 top-[335px] z-20 hidden h-16 w-16 lg:block" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 3c2 15 7 22 29 29-22 7-27 14-29 29-2-15-7-22-29-29C25 25 30 18 32 3z" fill="#fbf38c" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
      </svg>

      <div className={`card-pop relative z-10 mt-5 ml-auto w-full max-w-[36rem] overflow-hidden sm:w-[82%] ${compact ? "sm:-mt-1" : "sm:-mt-10"}`}>
        <p className={`flex items-center gap-3 border-b-2 border-ink bg-accent px-4 py-3 text-[20px] font-extrabold whitespace-nowrap text-white sm:px-5 ${compact ? "sm:text-[24px] xl:text-[28px]" : "sm:text-[30px]"}`}>
          Cleaned. Checked. Ready.
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m4.5 12.5 5 5 10-11" />
          </svg>
        </p>
        <div className="p-3 sm:p-4">
          <table className="w-full border-collapse whitespace-nowrap text-[14px] sm:text-[19px]">
            <thead>
              <tr className="bg-sunken">
                {output.columns.map((c) => (
                  <th key={c} scope="col" className="border border-rule-strong px-2 py-1.5 text-left font-bold sm:px-3">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {output.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-rule-strong px-2 py-1.5 font-medium sm:px-3">
                      {c === row.length - 1 ? (
                        <span className="flex items-center justify-between gap-2">
                          {cell}
                          <Check />
                        </span>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {notes.length > 0 && <p className="mt-3 rounded-md bg-lime-soft px-3 py-2 text-center text-[15px] font-bold sm:text-[17px]">{notes.join(" · ")}</p>}
        </div>
      </div>
      <figcaption className="sr-only">Live output of GridRinse&apos;s default cleaning steps on the example rows above.</figcaption>
    </figure>
  );
}
