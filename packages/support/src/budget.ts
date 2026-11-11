/**
 * AI spend control. Every model call reserves its worst-case cost first (inside a transaction holding an
 * advisory lock, so concurrent requests can never jointly exceed the cap), then settles the actual cost
 * from the response's token usage. Costs are micro-dollars (1 USD = 1,000,000) from published prices.
 */
import type { DbHandle } from "@repo/database";
import { raiseIncident } from "@repo/ops";
import type { SqlExecutor } from "./types";

/** USD per million tokens (Claude API first-party prices). */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-haiku-5-5": { inputPerMTok: 0.1, outputPerMTok: 0.5 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-sonnet-5-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-5-5": { inputPerMTok: 4, outputPerMTok: 20 },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-fable-5-2": { inputPerMTok: 8, outputPerMTok: 40 },
};

/** Unknown model ids are priced at the most expensive tier, so a typo can only make the cap stricter. */
const FALLBACK_PRICE: ModelPrice = { inputPerMTok: 10, outputPerMTok: 50 };

export function priceFor(model: string): ModelPrice {
  return MODEL_PRICES[model] ?? FALLBACK_PRICE;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

export function costMicros(model: string, u: TokenUsage): number {
  const p = priceFor(model);
  const input = u.inputTokens + (u.cacheWriteTokens ?? 0) * 1.25 + (u.cacheReadTokens ?? 0) * 0.1;
  return Math.ceil(input * p.inputPerMTok + u.outputTokens * p.outputPerMTok);
}

export interface BudgetConfig {
  monthlyCapCents: number;
  dailyCapCents: number;
}

export interface Reservation {
  day: string;
  micros: number;
}

export type ReserveResult = { ok: true; reservation: Reservation } | { ok: false; reason: "monthly_cap" | "daily_cap" };

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (d: Date) => `${d.toISOString().slice(0, 7)}-01`;
function nextMonthStart(d: Date): string {
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return n.toISOString().slice(0, 10);
}

const LOCK_KEY = 74_100_201; // arbitrary constant: one budget lock per database

async function spent(ex: SqlExecutor, now: Date): Promise<{ month: number; day: number }> {
  const { rows } = await ex.query<{ month: string | number; day: string | number }>(
    `SELECT COALESCE(SUM(cost_micros + reserved_micros), 0)::bigint AS month,
            COALESCE(SUM(cost_micros + reserved_micros) FILTER (WHERE day = $3::date), 0)::bigint AS day
     FROM support_ai_usage WHERE day >= $1::date AND day < $2::date`,
    [monthStart(now), nextMonthStart(now), dayOf(now)],
  );
  return { month: Number(rows[0]?.month ?? 0), day: Number(rows[0]?.day ?? 0) };
}

export async function reserveBudget(
  handle: Pick<DbHandle<any>, "transaction">,
  cfg: BudgetConfig,
  estimateMicros: number,
  now: Date,
): Promise<ReserveResult> {
  const est = Math.max(1, Math.ceil(estimateMicros));
  return handle.transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock($1)`, [LOCK_KEY]);
    const s = await spent(tx, now);
    if (s.month + est > cfg.monthlyCapCents * 10_000) return { ok: false, reason: "monthly_cap" } as const;
    if (s.day + est > cfg.dailyCapCents * 10_000) return { ok: false, reason: "daily_cap" } as const;
    await tx.query(
      `INSERT INTO support_ai_usage (day, calls, reserved_micros, updated_at) VALUES ($1::date, 1, $2, $3)
       ON CONFLICT (day) DO UPDATE SET calls = support_ai_usage.calls + 1,
         reserved_micros = support_ai_usage.reserved_micros + EXCLUDED.reserved_micros, updated_at = EXCLUDED.updated_at`,
      [dayOf(now), est, now.toISOString()],
    );
    return { ok: true, reservation: { day: dayOf(now), micros: est } } as const;
  });
}

/** Releases the reservation and books the actual cost (which may exceed the estimate; it is still recorded). */
export async function settleBudget(
  handle: Pick<DbHandle<any>, "transaction">,
  r: Reservation,
  actualMicros: number,
  usage: TokenUsage,
  now: Date,
): Promise<void> {
  await handle.transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock($1)`, [LOCK_KEY]);
    await tx.query(
      `UPDATE support_ai_usage SET reserved_micros = GREATEST(reserved_micros - $2, 0), cost_micros = cost_micros + $3,
         input_tokens = input_tokens + $4, output_tokens = output_tokens + $5, updated_at = $6
       WHERE day = $1::date`,
      [r.day, r.micros, Math.max(0, Math.ceil(actualMicros)), usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0), usage.outputTokens, now.toISOString()],
    );
  });
}

export interface BudgetStatus {
  monthMicros: number;
  dayMicros: number;
  monthlyCapMicros: number;
  dailyCapMicros: number;
  ratio: number;
}

export async function budgetStatus(ex: SqlExecutor, cfg: BudgetConfig, now: Date): Promise<BudgetStatus> {
  const s = await spent(ex, now);
  const monthlyCapMicros = cfg.monthlyCapCents * 10_000;
  return {
    monthMicros: s.month,
    dayMicros: s.day,
    monthlyCapMicros,
    dailyCapMicros: cfg.dailyCapCents * 10_000,
    ratio: monthlyCapMicros > 0 ? s.month / monthlyCapMicros : 1,
  };
}

/** warning at >= 80 % of the monthly cap, critical at >= 100 % (or when a call was refused for the cap). */
export async function checkBudgetIncidents(
  ex: SqlExecutor,
  cfg: BudgetConfig,
  now: Date,
  opts: { app: string; refused?: "monthly_cap" | "daily_cap" } = { app: "app" },
): Promise<"none" | "warning" | "critical"> {
  const st = await budgetStatus(ex, cfg, now);
  const month = now.toISOString().slice(0, 7);
  const details = {
    spentUsd: (st.monthMicros / 1e6).toFixed(4),
    capUsd: (st.monthlyCapMicros / 1e6).toFixed(2),
    percent: Math.round(st.ratio * 100),
  };
  if (opts.refused === "daily_cap") {
    await raiseIncident(
      ex,
      { fingerprint: `support:ai_daily_cap:${now.toISOString().slice(0, 10)}`, severity: "warning", source: "support", title: `${opts.app}: support assistant daily AI cap reached (falling back to search)`, details },
      { now },
    );
  }
  const level = st.ratio >= 1 || opts.refused === "monthly_cap" ? "critical" : st.ratio >= 0.8 ? "warning" : "none";
  if (level !== "none") {
    await raiseIncident(
      ex,
      {
        fingerprint: `support:ai_budget:${month}`,
        severity: level,
        source: "support",
        title:
          level === "critical"
            ? `${opts.app}: support assistant monthly AI budget exhausted (answers fall back to search)`
            : `${opts.app}: support assistant used ${details.percent}% of its monthly AI budget`,
        details,
      },
      { now },
    );
  }
  return level;
}
