/** Small presentational pieces for the monitoring dashboard (server-renderable). */

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span className="text-sm text-muted">{values.length ? "1 scan" : "no scans yet"}</span>;
  const w = 96;
  const hgt = 24;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(hgt - (Math.max(0, Math.min(100, v)) / 100) * hgt).toFixed(1)}`).join(" ");
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const dir = last > first ? "up" : last < first ? "down" : "flat";
  return (
    <svg width={w} height={hgt} viewBox={`0 0 ${w} ${hgt}`} role="img" aria-label={`${label}: score ${dir} from ${first} to ${last} over ${values.length} scans`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" />
    </svg>
  );
}

export function SiteStatus({ status, paused, planLocked }: { status: string; paused: boolean; planLocked: boolean }) {
  const [text, cls] = planLocked
    ? ["Paused by plan", "border-warn bg-warn-wash text-warn"]
    : paused
      ? ["Paused", "border-rule-strong bg-paper-deep text-ink-soft"]
      : status === "unreachable"
        ? ["Unreachable", "border-fail bg-fail-wash text-fail"]
        : status === "ok"
          ? ["Up", "border-pass bg-pass-wash text-pass"]
          : ["First scan pending", "border-rule-strong bg-paper-deep text-ink-soft"];
  return <span className={`inline-block border px-2 py-0.5 text-xs font-semibold ${cls}`}>{text}</span>;
}

export function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  const cls = value >= 90 ? "text-pass" : value >= 70 ? "text-warn" : "text-fail";
  return <span className={`num text-lg font-medium ${cls}`}>{value}</span>;
}
