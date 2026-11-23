/**
 * The black cell: an example request trace that looks live. Pure CSS (no script): rows arrive one
 * after another on a 12 s loop, the newest one flashes, the cursor blinks and a pulse runs along
 * the scope line. Labelled as an example; nothing here is a real request. Under reduced motion it
 * is a still list.
 */
const ROWS: [string, string, string, string][] = [
  ["14:27:08", "POST", "/stripe/checkout", "200"],
  ["14:27:11", "POST", "/github/push", "200"],
  ["14:27:15", "PUT", "/shopify/orders/42", "422"],
  ["14:27:16", "PUT", "/shopify/orders/42", "200"],
  ["14:27:21", "GET", "/ci/build/14", "200"],
  ["14:27:30", "POST", "/stripe/invoice", "503"],
  ["14:27:42", "POST", "/stripe/invoice", "200"],
  ["14:27:55", "DELETE", "/hooks/old", "204"],
];

export function TraceCell({ className = "" }: { className?: string }) {
  return (
    <div className={`theme-console wt-trace-cell relative flex flex-col bg-black p-4 font-mono text-[12px] leading-[18px] sm:p-5 ${className}`} aria-label="Example request trace (illustrative, not live data)" role="img">
      <div className="flex items-center justify-between text-[10.5px] uppercase tracking-[0.12em] text-[#9aa4ad]">
        <span>&gt; request_trace</span>
        <span className="flex items-center gap-1.5 text-signal">
          <span aria-hidden="true" className="wt-blink h-[7px] w-[7px] bg-signal" />
          example
        </span>
      </div>
      <svg viewBox="0 0 200 28" preserveAspectRatio="none" aria-hidden="true" className="mt-3 h-7 w-full" fill="none">
        <path d="M0 18H200" stroke="#2b3138" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path className="wt-scope" d="M0 18H70l6-12 8 20 6-14 4 6H200" stroke="var(--color-signal)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <ol className="mt-4 grid flex-1 content-start gap-[9px] lg:content-evenly">
        {ROWS.map(([t, m, p, s], i) => (
          <li key={i} className="wt-trace-row grid grid-cols-[4.6em_3.8em_1fr_auto] gap-2 whitespace-nowrap" style={{ ["--i" as string]: i }}>
            <span className="text-[#7d8790]">{t.slice(3)}</span>
            <span className="text-[#ffb27a]">{m}</span>
            <span className="truncate text-[#e9edf1]">{p}</span>
            <span className={s.startsWith("2") ? "text-[#6be3ae]" : "text-[#ffb44d]"}>{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[#9aa4ad]">
        <span className="text-signal">$</span> waiting for the next hook<span aria-hidden="true" className="wt-blink">_</span>
      </p>
    </div>
  );
}
