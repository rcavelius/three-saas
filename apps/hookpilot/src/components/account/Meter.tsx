export function Meter({ label, used, limit, unit = "" }: { label: string; used: number; limit: number; unit?: string }) {
  const unlimited = limit < 0;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const tone = pct >= 100 ? "bg-err" : pct >= 80 ? "bg-warn" : "bg-signal";
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between gap-3 text-[13px]">
        <span className="text-fg-muted">{label}</span>
        <span className="font-mono text-[12.5px] tabular-nums">
          {used.toLocaleString("en-US")}
          {unit} / {unlimited ? "unlimited" : `${limit.toLocaleString("en-US")}${unit}`}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={unlimited ? used : limit}
        aria-valuenow={used}
        className="h-1.5 rounded-full bg-surface-3 overflow-hidden"
      >
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AccountNav({ current }: { current: "account" | "team" | "billing" | "destinations" | "app" }) {
  const items: [typeof current, string, string][] = [
    ["app", "/app", "Endpoints"],
    ["destinations", "/account/destinations", "Destinations"],
    ["team", "/account/team", "Team"],
    ["billing", "/account/billing", "Billing"],
    ["account", "/account", "Account"],
  ];
  return (
    <nav aria-label="Workspace" className="flex flex-wrap gap-1 border-b border-line pb-2 mb-8 text-[13px]">
      {items.map(([k, href, label]) => (
        <a
          key={k}
          href={href}
          aria-current={k === current ? "page" : undefined}
          className={`px-2.5 py-1 rounded-[3px] ${k === current ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg"}`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
