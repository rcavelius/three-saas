import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnerMetrics, getSetting, healthReport, listOpenIncidents, monthToDateCosts, type Metric } from "@repo/ops";
import { getOperator } from "@/lib/admin";
import { getPlatform } from "@/lib/platform";
import { acknowledgeIncidentAction, recordCostAction, resolveIncidentAction, retryDeadLetterAction, setBudgetAction } from "./actions";

export const metadata: Metadata = { title: "Ops", robots: { index: false, follow: false } };

function fmt(m: Metric): string {
  if (m.value === null) return "n/a";
  if (m.unit === "cents") return `$${(m.value / 100).toFixed(2)}`;
  if (m.unit === "ratio") return `${(m.value * 100).toFixed(1)}%`;
  return m.value.toLocaleString("en-US");
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-line rounded-[6px] bg-surface p-4 min-w-0">
      <h2 className="label mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** Internal ops dashboard: operators/owner only (auth_user.role), 404 for everyone else. Server-rendered only. */
export default async function AdminPage() {
  const h = new Headers(await headers());
  const p = await getPlatform();
  const op = await getOperator(p, h);
  if (!op) notFound();
  const now = new Date();
  const [metrics, health, incidents, deadLetters, costs] = await Promise.all([
    getOwnerMetrics(p.ex, { plans: p.billing.catalog.plans, now }),
    healthReport(p.handle, { version: process.env.GIT_SHA ?? "dev", now }),
    listOpenIncidents(p.ex),
    p.scheduler.listDeadLetters({ limit: 20 }),
    monthToDateCosts(p.ex, now),
  ]);
  const acks = await Promise.all(incidents.map((i) => getSetting<{ by: string; at: string }>(p.ex, `hookpilot.incident_ack.${i.id}`)));
  const { rows: budgets } = await p.ex.query<{ name: string; monthly_limit_cents: number }>(`SELECT name, monthly_limit_cents FROM ops_budgets ORDER BY name`);
  const { rows: outbox } = await p.ex.query<{ status: string; n: number }>(
    `SELECT status, count(*)::int AS n FROM ops_email_outbox WHERE created_at > now() - interval '7 days' GROUP BY status ORDER BY status`,
  );
  const { rows: events } = await p.ex.query<{ id: string; type: string; outcome: string | null; received_at: Date; error: string | null }>(
    `SELECT id, type, outcome, received_at, error FROM billing_events ORDER BY received_at DESC LIMIT 15`,
  );

  const supportCounts = await p.support.adminCounts();
  const kpis: [string, Metric][] = [
    ["MRR", metrics.mrrCents],
    ["Active paid subscriptions", metrics.activePaidSubscriptions],
    ["New subscriptions (month)", metrics.newSubscriptionsThisMonth],
    ["Cancellations (month)", metrics.cancellationsThisMonth],
    ["Churn", metrics.churnRate],
    ["Signups (month)", metrics.signupsThisMonth],
    ["Conversion", metrics.conversionRate],
    ["Pageviews (30 d)", metrics.pageviews30d],
    ["Unique visitors (30 d)", metrics.uniqueVisitors30d],
    ["Costs MTD", metrics.costsMonthToDateCents],
    ["Est. Stripe fees", metrics.estimatedStripeFeesCents],
    ["Est. contribution", metrics.estimatedOperatingContributionCents],
  ];

  return (
    <div className="mx-auto w-full max-w-[1300px] px-4 py-10 grid gap-6">
      <div>
        <p className="label">Internal</p>
        <h1 className="mt-2 text-[26px] font-semibold">Operations</h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          Signed in as {op.email} ({op.role}). Generated {now.toISOString()}.
        </p>
      </div>

      <Card title="Support">
        <p className="text-[13px] text-fg-muted">
          {supportCounts.open} active tickets · {supportCounts.waitingOnOperator} waiting on us ·{" "}
          <strong className={supportCounts.escalated ? "text-err" : undefined}>{supportCounts.escalated} escalated</strong> ·{" "}
          <a href="/admin/support" className="text-signal underline">
            Open the support queue
          </a>
        </p>
      </Card>

      <Card title="Business">
        <dl className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {kpis.map(([k, m]) => (
            <div key={k}>
              <dt className="text-[12px] text-fg-dim">
                {k}
                {m.estimate ? " (estimate)" : ""}
              </dt>
              <dd className="font-mono text-[15px]" title={m.source}>
                {fmt(m)}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Health: ${health.status}`}>
          <ul className="text-[13px] grid gap-1 font-mono">
            <li>db: {health.checks.db.ok ? `ok (${health.checks.db.latencyMs} ms)` : `down ${health.checks.db.error ?? ""}`}</li>
            <li>queue backlog: {health.checks.queue.backlog}</li>
            <li>dead letters 24 h: {health.checks.deadLetters24h}</li>
            <li>scheduler heartbeat: {health.checks.scheduler.ageSeconds === null ? "never" : `${health.checks.scheduler.ageSeconds} s ago`}</li>
            <li>
              email outbox: {health.checks.emailOutbox.pending} pending, {health.checks.emailOutbox.failed24h} failed (24 h)
            </li>
          </ul>
          {health.reasons.length > 0 && <p className="mt-2 text-[12.5px] text-warn">{health.reasons.join("; ")}</p>}
        </Card>

        <Card title={`Open incidents (${incidents.length})`}>
          {incidents.length === 0 ? (
            <p className="text-[13px] text-fg-muted">None.</p>
          ) : (
            <ul className="grid gap-2">
              {incidents.map((i, idx) => (
                <li key={i.id} className="border border-line rounded-[4px] p-2 text-[13px] grid gap-1">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className={i.severity === "critical" ? "text-err" : i.severity === "warning" ? "text-warn" : "text-fg-muted"}>{i.severity}</span>
                    <span className="font-medium">{i.title}</span>
                    <span className="font-mono text-[11.5px] text-fg-dim">×{i.occurrences}</span>
                  </div>
                  <p className="font-mono text-[11.5px] text-fg-dim break-all">
                    {i.fingerprint} · last {new Date(i.last_seen_at).toISOString()}
                    {acks[idx] ? ` · acknowledged by ${acks[idx]!.by}` : ""}
                  </p>
                  <div className="flex gap-2">
                    {!acks[idx] && (
                      <form action={acknowledgeIncidentAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <button className="btn h-7">Acknowledge</button>
                      </form>
                    )}
                    <form action={resolveIncidentAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <button className="btn h-7">Resolve</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Dead-letter jobs (${deadLetters.length})`}>
          {deadLetters.length === 0 ? (
            <p className="text-[13px] text-fg-muted">None.</p>
          ) : (
            <ul className="grid gap-2">
              {deadLetters.map((d) => (
                <li key={d.id} className="text-[12.5px] flex flex-wrap gap-2 items-center">
                  <span className="font-mono">{d.queue}</span>
                  <span className="text-fg-dim break-all">{(d.lastError ?? "").slice(0, 160)}</span>
                  <form action={retryDeadLetterAction} className="ml-auto">
                    <input type="hidden" name="id" value={d.id} />
                    <button className="btn h-7">Retry</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Budgets and costs">
          <p className="text-[13px]">
            Month to date: <span className="font-mono">${(costs.totalCents / 100).toFixed(2)}</span>
            {Object.entries(costs.byProvider).map(([k, v]) => (
              <span key={k} className="ml-3 font-mono text-[12px] text-fg-muted">
                {k} ${(v / 100).toFixed(2)}
              </span>
            ))}
          </p>
          <ul className="mt-2 text-[12.5px] font-mono">
            {budgets.map((b) => (
              <li key={b.name}>
                {b.name}: ${(Number(b.monthly_limit_cents) / 100).toFixed(2)} / month
              </li>
            ))}
          </ul>
          <form action={setBudgetAction} className="mt-3 flex flex-wrap gap-2 items-end">
            <label className="grid gap-1 text-[12px]">
              <span className="text-fg-dim">Budget name (provider or total)</span>
              <input name="name" className="field h-8" required pattern="[a-zA-Z0-9_.\-]{1,50}" />
            </label>
            <label className="grid gap-1 text-[12px]">
              <span className="text-fg-dim">Monthly limit (USD)</span>
              <input name="usd" className="field h-8 w-28" required type="number" min="0" step="0.01" />
            </label>
            <button className="btn h-8">Set budget</button>
          </form>
          <form action={recordCostAction} className="mt-3 flex flex-wrap gap-2 items-end">
            <label className="grid gap-1 text-[12px]">
              <span className="text-fg-dim">Provider</span>
              <input name="provider" className="field h-8" required pattern="[a-zA-Z0-9_.\-]{1,50}" />
            </label>
            <label className="grid gap-1 text-[12px]">
              <span className="text-fg-dim">Amount (USD)</span>
              <input name="usd" className="field h-8 w-28" required type="number" min="0" step="0.01" />
            </label>
            <label className="grid gap-1 text-[12px]">
              <span className="text-fg-dim">Description</span>
              <input name="description" className="field h-8" maxLength={500} />
            </label>
            <button className="btn h-8">Record cost</button>
          </form>
        </Card>

        <Card title="Email outbox (7 days)">
          <ul className="text-[13px] font-mono">
            {outbox.length === 0 ? <li className="text-fg-muted">No emails.</li> : outbox.map((o) => <li key={o.status}>{o.status}: {o.n}</li>)}
          </ul>
        </Card>

        <Card title="Recent billing events">
          <ul className="text-[12px] font-mono grid gap-1">
            {events.length === 0 ? (
              <li className="text-fg-muted">None.</li>
            ) : (
              events.map((e) => (
                <li key={e.id} className="break-all">
                  {new Date(e.received_at).toISOString()} {e.type} → {e.outcome ?? "pending"}
                  {e.error ? ` (${e.error.slice(0, 80)})` : ""}
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
