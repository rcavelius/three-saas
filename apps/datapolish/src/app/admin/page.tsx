import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOwnerMetrics, healthReport, listOpenIncidents, type Metric } from "@repo/ops";
import { CATALOG, getPlatform } from "@/server/platform";
import { requireOperator } from "@/server/routes";

export const metadata: Metadata = { title: "Ops", robots: { index: false, follow: false } };

/**
 * Internal ops dashboard. Server component only: the role check happens here, on the server, and
 * anyone who is not an operator/owner (auth_user.role) gets the normal 404 page.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const p = await getPlatform();
  const s = await requireOperator(p, new Headers(await headers()));
  if (!s) notFound();
  const { done } = await searchParams;
  const ex = p.handle.executor;
  const now = p.now();
  const [metrics, health, incidents, deadLetters, budgets, outbox, outboxRecent, billingEvents] = await Promise.all([
    getOwnerMetrics(ex, { plans: CATALOG.plans, now }),
    healthReport(p.handle, { now, version: p.env.version }),
    listOpenIncidents(ex),
    p.scheduler.listDeadLetters({ limit: 20 }),
    ex.query<{ name: string; monthly_limit_cents: number; warn_ratio: number }>(`SELECT name, monthly_limit_cents, warn_ratio FROM ops_budgets ORDER BY name`),
    ex.query<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM ops_email_outbox WHERE created_at > now() - interval '7 days' GROUP BY status ORDER BY status`),
    ex.query<{ id: string; tag: string; status: string; created_at: Date; error: string | null }>(
      `SELECT id, tag, status, created_at, error FROM ops_email_outbox ORDER BY created_at DESC LIMIT 10`,
    ),
    ex.query<{ id: string; type: string; outcome: string | null; error: string | null; received_at: Date }>(
      `SELECT id, type, outcome, error, received_at FROM billing_events ORDER BY received_at DESC LIMIT 15`,
    ),
  ]);

  const money = (m: Metric) => (m.value === null ? "n/a" : `$${(m.value / 100).toFixed(2)}`);
  const num = (m: Metric) => (m.value === null ? "n/a" : m.unit === "ratio" ? `${(m.value * 100).toFixed(1)}%` : String(m.value));
  const cards: [string, string, boolean | undefined][] = [
    ["MRR", money(metrics.mrrCents), metrics.mrrCents.estimate],
    ["Active paid", num(metrics.activePaidSubscriptions), undefined],
    ["New subs (month)", num(metrics.newSubscriptionsThisMonth), undefined],
    ["Cancellations (month)", num(metrics.cancellationsThisMonth), undefined],
    ["Churn", num(metrics.churnRate), undefined],
    ["Signups (month)", num(metrics.signupsThisMonth), undefined],
    ["Conversion", num(metrics.conversionRate), undefined],
    ["Pageviews 30d", num(metrics.pageviews30d), undefined],
    ["Visitors 30d", num(metrics.uniqueVisitors30d), undefined],
    ["Costs MTD", money(metrics.costsMonthToDateCents), undefined],
    ["Est. Stripe fees", money(metrics.estimatedStripeFeesCents), true],
    ["Est. contribution", money(metrics.estimatedOperatingContributionCents), true],
  ];

  const th = "border-b border-rule px-2 py-1 text-left text-xs font-semibold text-ink-2";
  const td = "border-b border-rule px-2 py-1 align-top";

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <p className="eyebrow">Internal</p>
      <h1 className="mt-1 text-2xl font-semibold">DataPolish ops</h1>
      {done && (
        <p role="status" className="mt-2 text-sm text-ink-2">
          Action: {done.replace(/[^a-z-]/g, "")}
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">
          Health: <span className={health.status === "ok" ? "text-accent" : "text-del-ink"}>{health.status}</span>
        </h2>
        {health.reasons.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {health.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        <p className="mt-1 font-mono text-xs text-ink-3">
          db {health.checks.db.latencyMs ?? "?"} ms · queue backlog {health.checks.queue.backlog} · dead letters 24h {health.checks.deadLetters24h} · scheduler{" "}
          {health.checks.scheduler.ageSeconds === null ? "never ran" : `${health.checks.scheduler.ageSeconds}s ago`} · outbox failed 24h {health.checks.emailOutbox.failed24h}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Business (real rows only)</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {cards.map(([k, v, est]) => (
            <div key={k} className="border border-rule bg-surface px-3 py-2">
              <dt className="text-[11px] text-ink-3">
                {k}
                {est ? " (estimate)" : ""}
              </dt>
              <dd className="font-mono text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Open incidents ({incidents.length})</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>Severity</th>
              <th className={th}>Title</th>
              <th className={th}>Seen</th>
              <th className={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id}>
                <td className={td}>{i.severity}</td>
                <td className={td}>
                  {i.title}
                  <span className="block font-mono text-[11px] text-ink-3">
                    {i.fingerprint} ×{i.occurrences}
                    {i.details && (i.details as { acknowledged_at?: string }).acknowledged_at ? " · acknowledged" : ""}
                  </span>
                </td>
                <td className={`${td} font-mono text-xs`}>{new Date(i.last_seen_at).toISOString().slice(0, 16)}</td>
                <td className={td}>
                  <form method="post" action="/api/admin/actions" className="inline">
                    <input type="hidden" name="action" value="ack" />
                    <input type="hidden" name="id" value={i.id} />
                    <button className="btn btn-sm">Acknowledge</button>
                  </form>{" "}
                  <form method="post" action="/api/admin/actions" className="inline">
                    <input type="hidden" name="action" value="resolve" />
                    <input type="hidden" name="id" value={i.id} />
                    <button className="btn btn-sm">Resolve</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Dead-letter jobs ({deadLetters.length})</h2>
        <table className="mt-2 w-full border-collapse text-sm">
          <tbody>
            {deadLetters.map((d) => (
              <tr key={d.id}>
                <td className={td}>{d.queue}</td>
                <td className={`${td} font-mono text-xs`}>{d.lastError?.slice(0, 160)}</td>
                <td className={td}>
                  <form method="post" action="/api/admin/actions">
                    <input type="hidden" name="action" value="retry" />
                    <input type="hidden" name="id" value={d.id} />
                    <button className="btn btn-sm">Retry</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold">Budgets</h2>
          <ul className="mt-2 text-sm">
            {budgets.rows.map((b) => (
              <li key={b.name} className="font-mono">
                {b.name}: ${(b.monthly_limit_cents / 100).toFixed(2)}/month (warn at {Math.round(b.warn_ratio * 100)}%)
              </li>
            ))}
          </ul>
          <form method="post" action="/api/admin/actions" className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="action" value="budget" />
            <label className="text-sm">
              Provider or &ldquo;total&rdquo;
              <input name="name" className="field" required pattern="[a-z0-9_.\-]{1,50}" />
            </label>
            <label className="text-sm">
              Monthly limit (USD)
              <input name="limit" type="number" min="1" step="1" className="field" required />
            </label>
            <button className="btn btn-sm">Set budget</button>
          </form>
          <h3 className="mt-4 font-semibold">Record a cost</h3>
          <form method="post" action="/api/admin/actions" className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="action" value="cost" />
            <label className="text-sm">
              Provider
              <input name="provider" className="field" required pattern="[A-Za-z0-9_.\-]{1,50}" />
            </label>
            <label className="text-sm">
              Amount (USD)
              <input name="amount" type="number" min="0" step="0.01" className="field" required />
            </label>
            <label className="text-sm">
              Note
              <input name="description" className="field" maxLength={500} />
            </label>
            <button className="btn btn-sm">Record</button>
          </form>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Email outbox (7 days)</h2>
          <p className="mt-1 font-mono text-sm">{outbox.rows.map((r) => `${r.status}: ${r.n}`).join(" · ") || "empty"}</p>
          <ul className="mt-2 font-mono text-xs">
            {outboxRecent.rows.map((r) => (
              <li key={r.id}>
                {new Date(r.created_at).toISOString().slice(0, 16)} {r.tag} {r.status} {r.error ? `— ${r.error.slice(0, 80)}` : ""}
              </li>
            ))}
          </ul>
          <h2 className="mt-4 text-lg font-semibold">Recent billing events</h2>
          <ul className="mt-2 font-mono text-xs">
            {billingEvents.rows.map((e) => (
              <li key={e.id}>
                {new Date(e.received_at).toISOString().slice(0, 16)} {e.type} {e.outcome ?? "pending"} {e.error ? `— ${e.error.slice(0, 80)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
