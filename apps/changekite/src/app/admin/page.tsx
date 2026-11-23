import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CHANGEKITE_CATALOG } from "@repo/billing";
import { getOwnerMetrics, healthReport, listOpenIncidents, maskEmail, monthToDateCosts, type Metric } from "@repo/ops";
import { Notice, fmtDate, inputClass, secondaryButton } from "@/components/ui";
import { getPlatform } from "@/lib/platform";
import { isOperator } from "@/lib/http";

export const metadata: Metadata = { title: "Operations", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function fmt(m: Metric): string {
  if (m.value === null) return "n/a";
  if (m.unit === "cents") return `$${(m.value / 100).toFixed(2)}`;
  if (m.unit === "ratio") return `${(m.value * 100).toFixed(1)}%`;
  return String(m.value);
}

function Stat({ label, m }: { label: string; m: Metric }) {
  return (
    <div className="border border-rule bg-sheet p-4">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-2xl">{fmt(m)}</p>
      <p className="mt-1 text-xs text-muted">
        {m.estimate ? "estimate · " : ""}
        {m.source}
      </p>
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await getPlatform();
  const operator = await isOperator(p, await headers());
  if (!operator) notFound();
  const sp = await searchParams;
  const ex = p.handle.executor;
  const now = p.now();
  const [metrics, health, incidents, deadLetters, costs] = await Promise.all([
    getOwnerMetrics(ex, { plans: CHANGEKITE_CATALOG.plans, now }),
    healthReport(p.handle, { now, version: p.env.GIT_SHA ?? "dev" }),
    listOpenIncidents(ex),
    p.scheduler.listDeadLetters({ limit: 20 }),
    monthToDateCosts(ex, now),
  ]);
  const { rows: budgets } = await ex.query<{ name: string; monthly_limit_cents: number; warn_ratio: number }>(
    `SELECT name, monthly_limit_cents, warn_ratio FROM ops_budgets ORDER BY name`,
  );
  const { rows: outbox } = await ex.query<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM ops_email_outbox GROUP BY status ORDER BY status`);
  const { rows: recentMail } = await ex.query<{ to_address: string; tag: string; status: string; created_at: string; error: string | null }>(
    `SELECT to_address, tag, status, created_at, error FROM ops_email_outbox ORDER BY created_at DESC LIMIT 15`,
  );
  const { rows: events } = await ex.query<{ id: string; type: string; outcome: string | null; error: string | null; received_at: string }>(
    `SELECT id, type, outcome, error, received_at FROM billing_events ORDER BY received_at DESC LIMIT 20`,
  );
  const { rows: siteStats } = await ex.query<{ sites: number; unreachable: number; queued: number }>(
    `SELECT (SELECT count(*)::int FROM sites) AS sites,
            (SELECT count(*)::int FROM sites WHERE status = 'unreachable') AS unreachable,
            (SELECT count(*)::int FROM jobs WHERE queue = 'scan.site' AND status = 'queued') AS queued`,
  );
  const msg = typeof sp.msg === "string" ? sp.msg.slice(0, 120) : null;
  const supportCounts = await p.support.adminCounts();

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
      <p className="eyebrow">Internal · {maskEmail(operator.email)}</p>
      <h1 className="mt-3 display text-[2.6rem]">Operations</h1>
      {msg && (
        <div className="mt-6">
          <Notice tone="info" role="status">
            {msg}
          </Notice>
        </div>
      )}

      <section aria-labelledby="support" className="mt-10 border border-rule bg-sheet p-4">
        <h2 id="support" className="font-display text-2xl font-semibold">
          Support
        </h2>
        <p className="mt-2 text-ink-soft">
          {supportCounts.open} active tickets · {supportCounts.waitingOnOperator} waiting on us ·{" "}
          <strong className={supportCounts.escalated ? "text-fail" : undefined}>{supportCounts.escalated} escalated</strong> ·{" "}
          <a href="/admin/support" className="text-accent underline">
            Open the support queue
          </a>
        </p>
      </section>

      <section aria-labelledby="health" className="mt-10">
        <h2 id="health" className="font-display text-2xl font-semibold">
          Health: <span className={health.status === "ok" ? "text-pass" : health.status === "degraded" ? "text-warn" : "text-fail"}>{health.status}</span>
        </h2>
        {health.reasons.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft">
            {health.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted">
          DB {health.checks.db.latencyMs ?? "?"} ms · queue backlog {health.checks.queue.backlog} · scheduler heartbeat{" "}
          {health.checks.scheduler.ageSeconds === null ? "never" : `${health.checks.scheduler.ageSeconds}s ago`} · monitored sites {siteStats[0]!.sites} (
          {siteStats[0]!.unreachable} unreachable, {siteStats[0]!.queued} scans queued)
        </p>
      </section>

      <section aria-labelledby="metrics" className="mt-10">
        <h2 id="metrics" className="font-display text-2xl font-semibold">
          Business (since {metrics.periodStart.slice(0, 10)})
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="MRR" m={metrics.mrrCents} />
          <Stat label="Active paid subscriptions" m={metrics.activePaidSubscriptions} />
          <Stat label="New subscriptions" m={metrics.newSubscriptionsThisMonth} />
          <Stat label="Cancellations" m={metrics.cancellationsThisMonth} />
          <Stat label="Churn" m={metrics.churnRate} />
          <Stat label="Signups" m={metrics.signupsThisMonth} />
          <Stat label="Conversion" m={metrics.conversionRate} />
          <Stat label="Pageviews 30 d" m={metrics.pageviews30d} />
          <Stat label="Unique visitors 30 d" m={metrics.uniqueVisitors30d} />
          <Stat label="Costs MTD" m={metrics.costsMonthToDateCents} />
          <Stat label="Est. Stripe fees" m={metrics.estimatedStripeFeesCents} />
          <Stat label="Est. contribution" m={metrics.estimatedOperatingContributionCents} />
        </div>
      </section>

      <section aria-labelledby="incidents" className="mt-10">
        <h2 id="incidents" className="font-display text-2xl font-semibold">
          Open incidents ({incidents.length})
        </h2>
        {incidents.length === 0 ? (
          <p className="mt-2 text-muted">None.</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {incidents.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    <span className={`eyebrow mr-2 ${i.severity === "critical" ? "!text-fail" : i.severity === "warning" ? "!text-warn" : ""}`}>{i.severity}</span>
                    {i.title}
                  </p>
                  <p className="text-sm text-muted">
                    {i.fingerprint} · {i.occurrences}× · last {fmtDate(new Date(i.last_seen_at).toISOString())}
                    {i.details && (i.details as Record<string, unknown>).acknowledged_by ? ` · acknowledged by ${String((i.details as Record<string, unknown>).acknowledged_by)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form method="post" action="/api/admin/incidents">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="op" value="ack" />
                    <button className={secondaryButton} type="submit">Acknowledge</button>
                  </form>
                  <form method="post" action="/api/admin/incidents">
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="op" value="resolve" />
                    <button className={secondaryButton} type="submit">Resolve</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dead" className="mt-10">
        <h2 id="dead" className="font-display text-2xl font-semibold">
          Dead-letter jobs ({deadLetters.length})
        </h2>
        {deadLetters.length === 0 ? (
          <p className="mt-2 text-muted">None.</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule text-sm">
            {deadLetters.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="num font-medium">{d.queue}</p>
                  <p className="text-muted">
                    {d.attempts} attempts · {d.finishedAt ? fmtDate(d.finishedAt.toISOString()) : ""} · {d.lastError?.slice(0, 160)}
                  </p>
                </div>
                <form method="post" action="/api/admin/dead-letters">
                  <input type="hidden" name="id" value={d.id} />
                  <button className={secondaryButton} type="submit">Retry</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="budgets">
          <h2 id="budgets" className="font-display text-2xl font-semibold">
            Budgets
          </h2>
          <ul className="mt-3 text-sm">
            {budgets.map((b) => (
              <li key={b.name} className="flex justify-between border-b border-rule py-1">
                <span className="num">{b.name}</span>
                <span className="num">
                  ${(Number(b.monthly_limit_cents) / 100).toFixed(2)}/mo · MTD ${((b.name === "total" ? costs.totalCents : (costs.byProvider[b.name] ?? 0)) / 100).toFixed(2)}
                </span>
              </li>
            ))}
            {budgets.length === 0 && <li className="text-muted">No budgets set.</li>}
          </ul>
          <form method="post" action="/api/admin/budgets" className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
            <div>
              <label htmlFor="b-name" className="block text-sm font-medium">Provider or “total”</label>
              <input id="b-name" name="name" className={`mt-1 ${inputClass}`} required maxLength={50} />
            </div>
            <div>
              <label htmlFor="b-limit" className="block text-sm font-medium">USD / month</label>
              <input id="b-limit" name="limitUsd" type="number" min="0" step="0.01" className={`mt-1 ${inputClass}`} required />
            </div>
            <button className={secondaryButton} type="submit">Set budget</button>
          </form>
        </section>
        <section aria-labelledby="cost">
          <h2 id="cost" className="font-display text-2xl font-semibold">
            Record a cost (this month)
          </h2>
          <form method="post" action="/api/admin/costs" className="mt-4 grid gap-3">
            <div>
              <label htmlFor="c-provider" className="block text-sm font-medium">Provider</label>
              <input id="c-provider" name="provider" className={`mt-1 ${inputClass}`} required maxLength={50} />
            </div>
            <div>
              <label htmlFor="c-desc" className="block text-sm font-medium">Description</label>
              <input id="c-desc" name="description" className={`mt-1 ${inputClass}`} maxLength={200} />
            </div>
            <div>
              <label htmlFor="c-amount" className="block text-sm font-medium">Amount (USD)</label>
              <input id="c-amount" name="amountUsd" type="number" min="0" step="0.01" className={`mt-1 ${inputClass}`} required />
            </div>
            <button className={secondaryButton} type="submit">Record cost</button>
          </form>
        </section>
      </div>

      <section aria-labelledby="mail" className="mt-10">
        <h2 id="mail" className="font-display text-2xl font-semibold">
          Email outbox
        </h2>
        <p className="mt-2 text-sm text-muted">
          {outbox.map((o) => `${o.status}: ${o.n}`).join(" · ") || "empty"}
          {p.env.RESEND_API_KEY ? "" : " — no RESEND_API_KEY: emails are logged, not sent"}
        </p>
        <ul className="mt-3 text-sm">
          {recentMail.map((m, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-rule py-1">
              <span className="num">
                {maskEmail(m.to_address)} · {m.tag}
              </span>
              <span className="text-muted">
                {m.status} · {fmtDate(new Date(m.created_at).toISOString())}
                {m.error ? ` · ${m.error.slice(0, 60)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="billing-events" className="mt-10">
        <h2 id="billing-events" className="font-display text-2xl font-semibold">
          Recent billing events
        </h2>
        {events.length === 0 ? (
          <p className="mt-2 text-muted">None yet{p.billingEnabled ? "" : " (Stripe is not configured)"}.</p>
        ) : (
          <ul className="mt-3 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-rule py-1">
                <span className="num">{e.type}</span>
                <span className="text-muted">
                  {e.outcome ?? "pending"} · {fmtDate(new Date(e.received_at).toISOString())}
                  {e.error ? ` · ${e.error.slice(0, 80)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
