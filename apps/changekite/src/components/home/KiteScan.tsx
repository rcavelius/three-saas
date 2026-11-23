/**
 * The hero: a kite whose frame is a site map and whose tail is the twelve checks.
 * On load the spars draw, a scan band sweeps the kite, each example page lights up in crawl order, then the
 * bows on the tail take their example result. The kite then rides the wind. Pure SVG + CSS (globals.css);
 * the server HTML already holds the final state, and reduced motion shows it without movement.
 */
import { TAIL, BOW_FILL, BOW_WORD, exampleBowStates } from "./checks";

type P = [number, number];

// Kite geometry (viewBox 0 0 640 720).
const TOP: P = [392, 24];
const LEFT: P = [196, 246];
const RIGHT: P = [588, 246];
const BOTTOM: P = [392, 566];

// Example site map: home at the top, three sections on the cross spar, five pages below.
const NODES: { p: P; w: number; parent?: number }[] = [
  { p: [392, 104], w: 64 },
  { p: [282, 246], w: 54, parent: 0 },
  { p: [392, 246], w: 54, parent: 0 },
  { p: [502, 246], w: 54, parent: 0 },
  { p: [300, 352], w: 46, parent: 1 },
  { p: [392, 352], w: 46, parent: 2 },
  { p: [484, 352], w: 46, parent: 3 },
  { p: [350, 448], w: 40, parent: 5 },
  { p: [434, 448], w: 40, parent: 5 },
];
const BROKEN = 7; // the example's broken internal link (/order-now)

// The tail: two cubic segments hanging from the bottom vertex and sweeping left.
const SEGS: [P, P, P, P][] = [
  [BOTTOM, [356, 650], [262, 606], [196, 652]],
  [[196, 652], [128, 700], [62, 636], [-8, 690]],
];

function cubic([a, b, c, d]: [P, P, P, P], t: number): { p: P; deg: number } {
  const mt = 1 - t;
  const x = mt ** 3 * a[0] + 3 * mt * mt * t * b[0] + 3 * mt * t * t * c[0] + t ** 3 * d[0];
  const y = mt ** 3 * a[1] + 3 * mt * mt * t * b[1] + 3 * mt * t * t * c[1] + t ** 3 * d[1];
  const dx = 3 * mt * mt * (b[0] - a[0]) + 6 * mt * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
  const dy = 3 * mt * mt * (b[1] - a[1]) + 6 * mt * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
  return { p: [x, y], deg: (Math.atan2(dy, dx) * 180) / Math.PI };
}

// 12 bows spread along both segments (6 each), starting a little below the vertex.
const BOWS = TAIL.map((_, i) => {
  const seg = SEGS[i < 6 ? 0 : 1]!;
  const t = i < 6 ? 0.14 + (i / 6) * 0.86 : ((i - 6) / 6) * 0.86 + 0.08;
  return cubic(seg, t);
});

const tailD = `M${SEGS[0]![0].join(",")} C${SEGS[0]!.slice(1).map((q) => q.join(",")).join(" ")} C${SEGS[1]!.slice(1).map((q) => q.join(",")).join(" ")}`;
const kiteD = `M${TOP.join(",")} L${RIGHT.join(",")} L${BOTTOM.join(",")} L${LEFT.join(",")} Z`;
const CENTER: P = [TOP[0], LEFT[1]];

const NODE_START = 650;
const NODE_STEP = 150;
const BOW_START = NODE_START + NODES.length * NODE_STEP + 200;
const BOW_STEP = 110;

export function KiteScan({ host, pages, score }: { host: string; pages: number; score: number }) {
  const states = exampleBowStates();
  const passed = TAIL.filter((c) => states[c.id] === "pass").length;
  const label = `Illustration: a kite drawn as the site map of ${host}, an example site. Its tail has one bow per check: ${passed} of 12 passed; internal links critical, descriptions warning, canonicals notice. Example score ${score}.`;

  return (
    <div className="relative">
      <svg viewBox="0 0 640 720" className="block h-auto w-full overflow-visible" role="img" aria-label={label}>
        <defs>
          <clipPath id="kite-clip">
            <path d={kiteD} />
          </clipPath>
        </defs>

        {/* The flying line runs down towards the form: you hold the string. */}
        <path d={`M${CENTER.join(",")} C 300 420 160 560 -40 760`} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />

        <g className="kite-body">
          {/* Four flat panels, like folded paper: no gradients. */}
          <path d={`M${TOP.join(",")} L${CENTER.join(",")} L${LEFT.join(",")} Z`} fill="#ff6b36" />
          <path d={`M${TOP.join(",")} L${RIGHT.join(",")} L${CENTER.join(",")} Z`} fill="var(--color-kite)" />
          <path d={`M${LEFT.join(",")} L${CENTER.join(",")} L${BOTTOM.join(",")} Z`} fill="#f04c12" />
          <path d={`M${CENTER.join(",")} L${RIGHT.join(",")} L${BOTTOM.join(",")} Z`} fill="var(--color-kite-deep)" />

          {/* Spars. */}
          <g stroke="rgba(7,12,34,0.28)" strokeWidth="3" strokeLinecap="round" fill="none">
            <path className="kite-spar" pathLength={1} d={`M${TOP.join(",")} L${BOTTOM.join(",")}`} style={{ ["--d" as string]: "100ms" }} />
            <path className="kite-spar" pathLength={1} d={`M${LEFT.join(",")} L${RIGHT.join(",")}`} style={{ ["--d" as string]: "260ms" }} />
          </g>

          {/* Site map connectors. */}
          <g stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9">
            {NODES.map((n, i) => {
              if (n.parent === undefined) return null;
              const a = NODES[n.parent]!.p;
              const midY = (a[1] + n.p[1]) / 2;
              return (
                <path
                  key={i}
                  className="kite-spar"
                  pathLength={1}
                  d={`M${a[0]},${a[1] + 16} V${midY} H${n.p[0]} V${n.p[1] - 14}`}
                  style={{ ["--d" as string]: `${NODE_START - 200 + i * NODE_STEP}ms` }}
                />
              );
            })}
          </g>

          {/* Pages: light up in crawl order. */}
          {NODES.map((n, i) => {
            const h = Math.round(n.w * 0.62);
            const x = n.p[0] - n.w / 2;
            const y = n.p[1] - h / 2;
            const broken = i === BROKEN;
            return (
              <g key={i}>
                <rect
                  className="kite-node"
                  x={x}
                  y={y}
                  width={n.w}
                  height={h}
                  rx="6"
                  fill="#fff"
                  style={{ ["--d" as string]: `${NODE_START + i * NODE_STEP}ms` }}
                />
                <rect x={x + 7} y={y + 7} width={n.w * 0.34} height="4" rx="2" fill="var(--color-kite)" />
                <rect x={x + 7} y={y + 15} width={n.w - 14} height="3" rx="1.5" fill="#ffc7b2" />
                {broken && (
                  <g className="ck-pop" style={{ ["--d" as string]: `${NODE_START + i * NODE_STEP + 260}ms` }}>
                    <circle cx={x + n.w} cy={y} r="11" fill="var(--color-bow-fail)" stroke="#fff" strokeWidth="3" />
                    <path d={`M${x + n.w} ${y - 5}v5.5`} stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                    <circle cx={x + n.w} cy={y + 4.5} r="1.7" fill="#fff" />
                  </g>
                )}
              </g>
            );
          })}

          {/* The scan band sweeps the kite twice. */}
          <g clipPath="url(#kite-clip)" aria-hidden="true">
            <rect className="kite-sweep" x="180" y="0" width="420" height="56" fill="rgba(255,255,255,0.22)" />
          </g>

          {/* The tail and its twelve bows. */}
          <path d={tailD} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          {TAIL.map((c, i) => {
            const b = BOWS[i]!;
            const s = states[c.id];
            return (
              <g key={c.id} transform={`translate(${b.p[0].toFixed(1)} ${b.p[1].toFixed(1)}) rotate(${b.deg.toFixed(1)})`}>
                <g className="kite-bow" style={{ ["--f" as string]: `${i * 140}ms` }}>
                  <title>{`${c.name}: ${BOW_WORD[s]} (example)`}</title>
                  <path
                    className="kite-bow-fill"
                    d="M0 0 L-17 -13 L-17 13 Z M0 0 L17 -13 L17 13 Z"
                    fill={BOW_FILL[s]}
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    style={{ ["--bow" as string]: BOW_FILL[s], ["--d" as string]: `${BOW_START + i * BOW_STEP}ms` }}
                  />
                  <circle r="4" fill="#fff" />
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
