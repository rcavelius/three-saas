/** Cost recording, monthly budgets and usage ceilings. All amounts are USD cents. */
import { autoResolve, raiseIncident } from "./incidents";
import type { Severity, SqlExecutor } from "./types";

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
export function nextMonthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export interface CostEntryInput {
  provider: string;
  description: string;
  amountCents: number;
  periodStart: Date;
  periodEnd: Date;
  /** "api" when pulled from a provider's usage API, "manual" when the owner typed it in. */
  source: "api" | "manual";
  currency?: string;
}

export async function recordCost(ex: SqlExecutor, c: CostEntryInput): Promise<string> {
  if (!Number.isInteger(c.amountCents) || c.amountCents < 0) throw new Error("amountCents must be a non-negative integer");
  if (!(c.periodEnd >= c.periodStart)) throw new Error("periodEnd must be >= periodStart");
  if (!/^[a-z0-9_.-]{1,50}$/i.test(c.provider)) throw new Error("provider must be 1-50 chars [a-z0-9_.-]");
  const { rows } = await ex.query<{ id: string }>(
    `INSERT INTO cost_entries (provider, description, amount_cents, currency, period_start, period_end, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      c.provider.toLowerCase(),
      c.description.slice(0, 500),
      c.amountCents,
      (c.currency ?? "usd").toLowerCase(),
      c.periodStart.toISOString(),
      c.periodEnd.toISOString(),
      c.source,
    ],
  );
  return rows[0]!.id;
}

export async function setBudget(
  ex: SqlExecutor,
  b: { name: string; monthlyLimitCents: number; warnRatio?: number },
  now: Date = new Date(),
): Promise<void> {
  await ex.query(
    `INSERT INTO ops_budgets (name, monthly_limit_cents, warn_ratio, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE SET monthly_limit_cents = EXCLUDED.monthly_limit_cents,
       warn_ratio = EXCLUDED.warn_ratio, updated_at = EXCLUDED.updated_at`,
    [b.name.toLowerCase(), b.monthlyLimitCents, b.warnRatio ?? 0.8, now.toISOString()],
  );
}

/** Month-to-date USD cost per provider (entries whose period starts in the current UTC month). */
export async function monthToDateCosts(
  ex: SqlExecutor,
  now: Date,
): Promise<{ totalCents: number; byProvider: Record<string, number> }> {
  const { rows } = await ex.query<{ provider: string; cents: number }>(
    `SELECT provider, sum(amount_cents)::int AS cents FROM cost_entries
     WHERE currency = 'usd' AND period_start >= $1 AND period_start < $2
     GROUP BY provider ORDER BY provider`,
    [monthStartUtc(now).toISOString(), nextMonthStartUtc(now).toISOString()],
  );
  const byProvider: Record<string, number> = {};
  let totalCents = 0;
  for (const r of rows) {
    byProvider[r.provider] = Number(r.cents);
    totalCents += Number(r.cents);
  }
  return { totalCents, byProvider };
}

export interface BudgetStatus {
  name: string;
  spentCents: number;
  limitCents: number;
  ratio: number;
  level: "ok" | "warning" | "critical";
}

/**
 * Compares month-to-date cost against every row in ops_budgets (name = provider, or "total").
 * warning at warn_ratio, critical at 100%; recovers (auto-resolves) below warn_ratio, e.g. next month.
 */
export async function checkBudgets(ex: SqlExecutor, opts: { now?: Date } = {}): Promise<BudgetStatus[]> {
  const now = opts.now ?? new Date();
  const costs = await monthToDateCosts(ex, now);
  const { rows } = await ex.query<{ name: string; monthly_limit_cents: number; warn_ratio: number }>(
    `SELECT name, monthly_limit_cents::int AS monthly_limit_cents, warn_ratio::float8 AS warn_ratio
     FROM ops_budgets ORDER BY name`,
  );
  const out: BudgetStatus[] = [];
  for (const b of rows) {
    const spent = b.name === "total" ? costs.totalCents : (costs.byProvider[b.name] ?? 0);
    const limit = Number(b.monthly_limit_cents);
    const ratio = spent / limit;
    const level: BudgetStatus["level"] = ratio >= 1 ? "critical" : ratio >= Number(b.warn_ratio) ? "warning" : "ok";
    const fingerprint = `budget:${b.name}`;
    if (level === "ok") {
      await autoResolve(ex, fingerprint, { now });
    } else {
      await raiseIncident(
        ex,
        {
          fingerprint,
          severity: level,
          source: "budgets",
          title: `${b.name === "total" ? "Total" : b.name} spend at ${Math.floor(ratio * 100)}% of monthly budget`,
          details: { spentCents: spent, limitCents: limit, warnRatio: Number(b.warn_ratio) },
        },
        { now },
      );
    }
    out.push({ name: b.name, spentCents: spent, limitCents: limit, ratio, level });
  }
  return out;
}

/**
 * Generic ceiling check for anything the app can count (rows in captured_requests, emails per day...).
 * warning at warnRatio (default 0.8), critical at 100%, auto-resolve below warnRatio.
 */
export async function checkUsageCeiling(
  ex: SqlExecutor,
  u: { metric: string; value: number; ceiling: number; warnRatio?: number; now?: Date },
): Promise<{ ratio: number; level: "ok" | Severity }> {
  if (!(u.ceiling > 0)) throw new Error("ceiling must be > 0");
  const ratio = u.value / u.ceiling;
  const warnRatio = u.warnRatio ?? 0.8;
  const fingerprint = `usage:${u.metric}`;
  const level = ratio >= 1 ? "critical" : ratio >= warnRatio ? "warning" : "ok";
  if (level === "ok") {
    await autoResolve(ex, fingerprint, { now: u.now });
  } else {
    await raiseIncident(
      ex,
      {
        fingerprint,
        severity: level,
        source: "usage",
        title: `${u.metric} at ${Math.floor(ratio * 100)}% of its ceiling`,
        details: { value: u.value, ceiling: u.ceiling },
      },
      { now: u.now },
    );
  }
  return { ratio, level };
}
