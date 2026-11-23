/**
 * The twelve checks as the kite's tail: two strings of six bows on wide screens, one long string down the
 * left on a phone. Each bow wears the example report's result for that check.
 */
import Link from "next/link";
import { TAIL, BOW_FILL, exampleBowStates, type BowState } from "./checks";

const RESULT: Record<BowState, { word: string; cls: string }> = {
  pass: { word: "Passed", cls: "bg-pass-wash text-pass" },
  notice: { word: "Notice", cls: "bg-notice-wash text-notice" },
  warning: { word: "Warning", cls: "bg-warn-wash text-warn" },
  critical: { word: "Critical", cls: "bg-fail-wash text-fail" },
};

// A sine string that crosses the centre line at every column centre (viewBox 0 0 600 72).
const WAVE = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const x = (i / 120) * 600;
    const y = 36 + 20 * Math.sin(Math.PI * ((x / 600) * 6 - 0.5));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
})();

function Bow({ fill, tilt }: { fill: string; tilt: number }) {
  return (
    <svg viewBox="-24 -18 48 36" className="relative h-[54px] w-[72px]" aria-hidden="true" style={{ transform: `rotate(${tilt}deg)` }}>
      <path d="M0 0 L-21 -16 L-21 16 Z M0 0 L21 -16 L21 16 Z" fill={fill} stroke="var(--color-ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle r="5" fill="var(--color-ink)" />
    </svg>
  );
}

export function Tail() {
  const states = exampleBowStates();
  const rows = [TAIL.slice(0, 6), TAIL.slice(6)];
  return (
    <div>
      {rows.map((row, ri) => (
        <div key={ri} className="relative mt-6 first:mt-0 lg:mt-16">
          {/* The string. */}
          <svg viewBox="0 0 600 72" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-0 hidden h-[54px] w-full lg:block" aria-hidden="true">
            <path d={WAVE} fill="none" stroke="var(--color-ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          <span aria-hidden="true" className="absolute bottom-0 left-[35px] top-0 w-[2px] bg-ink lg:hidden" />
          <ul className="relative grid gap-y-5 lg:grid-cols-6 lg:gap-x-4">
            {row.map((c, i) => {
              const s = states[c.id];
              const r = RESULT[s];
              return (
                <li
                  key={c.id}
                  className="ck-reveal grid grid-cols-[72px_1fr] items-center gap-x-4 lg:grid-cols-1 lg:justify-items-center lg:text-center"
                  style={{ ["--d" as string]: `${i * 70}ms` }}
                >
                  <Bow fill={BOW_FILL[s]} tilt={i % 2 ? 10 : -10} />
                  <div className="lg:mt-5">
                    <h3 className="text-[1.25rem] font-extrabold leading-tight">
                      <Link href={`/docs#${c.id}`} className="hover:text-accent">
                        {c.name}
                      </Link>
                    </h3>
                    <p className="mt-1 text-[1rem] leading-snug text-ink-soft">{c.gloss}</p>
                    <p className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[0.85rem] font-bold ${r.cls}`}>{r.word}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
