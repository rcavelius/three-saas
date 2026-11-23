/**
 * Plan catalog types and validation. A catalog is plain data (see catalogs.ts) shared by the app,
 * the pricing page, the ops dashboard and the Stripe setup script.
 */
import { z } from "zod";

export interface PlanDef {
  /** "free" | "solo" | ... unique within the catalog. */
  id: string;
  name: string;
  /** Monthly price in USD cents; 0 for the free plan. */
  priceMonthlyCents: number;
  /** Stripe Price lookup key, e.g. "changekite_solo_monthly". Absent for the free plan. */
  stripeLookupKey?: string;
  /** Numeric limits; -1 means unlimited. Every plan of a catalog has the same limit keys. */
  limits: Record<string, number>;
  /** Boolean features; every plan of a catalog has the same feature keys. */
  features: Record<string, boolean>;
}

/**
 * A one-time pass: paid once with Stripe Checkout (mode "payment"), never renews. While active it raises the
 * holder's limits/features on top of their plan (limits: the larger value wins, -1 = unlimited; features: OR).
 * Passes need no account: the buyer gets a signed cookie (and an unlock link); a signed-in buyer's org gets it too.
 */
export interface PassDef {
  /** "day" | "report" | ... unique within the catalog's passes. */
  id: string;
  /** Customer-facing name, e.g. "24-hour pass". */
  name: string;
  /** One-time price in USD cents. */
  priceCents: number;
  /** How long the pass lasts after payment. */
  durationHours: number;
  /** Stripe Price lookup key of the one-time price, e.g. "gridrinse_day_pass". */
  stripeLookupKey: string;
  /** Limits the pass raises (subset of the plan limit keys). */
  limits: Record<string, number>;
  /** Features the pass switches on (subset of the plan feature keys). */
  features: Record<string, boolean>;
}

export interface Catalog {
  /** App identifier, e.g. "changekite". Also stored in Stripe metadata. */
  app: string;
  plans: PlanDef[];
  freePlanId: string;
  /** One-time passes (optional). */
  passes?: PassDef[];
}

const idSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/, "lowercase id");

export const planDefSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(60),
    priceMonthlyCents: z.number().int().min(0).max(1_000_000),
    stripeLookupKey: z
      .string()
      .regex(/^[a-z0-9_]{3,200}$/, "lookup key: lowercase letters, digits, underscore")
      .optional(),
    limits: z.record(z.string(), z.number().int().min(-1)),
    features: z.record(z.string(), z.boolean()),
  })
  .strict();

export const passDefSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(60),
    priceCents: z.number().int().min(50).max(1_000_000),
    durationHours: z.number().int().min(1).max(24 * 366),
    stripeLookupKey: z.string().regex(/^[a-z0-9_]{3,200}$/, "lookup key: lowercase letters, digits, underscore"),
    limits: z.record(z.string(), z.number().int().min(-1)),
    features: z.record(z.string(), z.boolean()),
  })
  .strict();

export const catalogSchema = z
  .object({
    app: idSchema,
    plans: z.array(planDefSchema).min(1),
    freePlanId: idSchema,
    passes: z.array(passDefSchema).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const p of c.plans) {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: `duplicate plan id ${p.id}` });
      ids.add(p.id);
      if (p.stripeLookupKey) {
        if (keys.has(p.stripeLookupKey)) {
          ctx.addIssue({ code: "custom", message: `duplicate lookup key ${p.stripeLookupKey}` });
        }
        keys.add(p.stripeLookupKey);
      }
    }
    const free = c.plans.find((p) => p.id === c.freePlanId);
    if (!free) {
      ctx.addIssue({ code: "custom", message: `freePlanId ${c.freePlanId} is not a plan` });
      return;
    }
    if (free.priceMonthlyCents !== 0 || free.stripeLookupKey) {
      ctx.addIssue({ code: "custom", message: "free plan must cost 0 and have no lookup key" });
    }
    for (const p of c.plans) {
      if (p.id !== c.freePlanId && (!p.stripeLookupKey || p.priceMonthlyCents <= 0)) {
        ctx.addIssue({ code: "custom", message: `paid plan ${p.id} needs a price and a lookup key` });
      }
      const sameKeys = (a: Record<string, unknown>, b: Record<string, unknown>) =>
        Object.keys(a).sort().join(",") === Object.keys(b).sort().join(",");
      if (!sameKeys(p.limits, free.limits) || !sameKeys(p.features, free.features)) {
        ctx.addIssue({ code: "custom", message: `plan ${p.id} must define the same limit/feature keys as ${free.id}` });
      }
    }
    const passIds = new Set<string>();
    for (const pass of c.passes ?? []) {
      if (passIds.has(pass.id)) ctx.addIssue({ code: "custom", message: `duplicate pass id ${pass.id}` });
      passIds.add(pass.id);
      if (keys.has(pass.stripeLookupKey)) ctx.addIssue({ code: "custom", message: `duplicate lookup key ${pass.stripeLookupKey}` });
      keys.add(pass.stripeLookupKey);
      for (const k of Object.keys(pass.limits)) {
        if (!(k in free.limits)) ctx.addIssue({ code: "custom", message: `pass ${pass.id} limit ${k} is not a plan limit` });
      }
      for (const k of Object.keys(pass.features)) {
        if (!(k in free.features)) ctx.addIssue({ code: "custom", message: `pass ${pass.id} feature ${k} is not a plan feature` });
      }
    }
  });

/** Validates a catalog and returns it (throws a descriptive error otherwise). */
export function defineCatalog(c: Catalog): Catalog {
  const r = catalogSchema.safeParse(c);
  if (!r.success) {
    throw new Error(`Invalid billing catalog "${c.app}": ${r.error.issues.map((i) => i.message).join("; ")}`);
  }
  return c;
}

export function getPlan(catalog: Catalog, planId: string): PlanDef | undefined {
  return catalog.plans.find((p) => p.id === planId);
}

export function getFreePlan(catalog: Catalog): PlanDef {
  const p = getPlan(catalog, catalog.freePlanId);
  if (!p) throw new Error(`catalog ${catalog.app} has no free plan`);
  return p;
}

export function planByLookupKey(catalog: Catalog, lookupKey: string | null | undefined): PlanDef | undefined {
  if (!lookupKey) return undefined;
  return catalog.plans.find((p) => p.stripeLookupKey === lookupKey);
}

export function paidPlans(catalog: Catalog): PlanDef[] {
  return catalog.plans.filter((p) => p.id !== catalog.freePlanId);
}

export function getPass(catalog: Catalog, passId: string): PassDef | undefined {
  return (catalog.passes ?? []).find((p) => p.id === passId);
}

/** Larger limit wins; -1 (unlimited) beats everything. */
export function maxLimit(a: number, b: number): number {
  if (a === -1 || b === -1) return -1;
  return Math.max(a, b);
}

/** Plan limits/features raised by the given passes (pure; returns copies). */
export function applyPassGrants(
  limits: Record<string, number>,
  features: Record<string, boolean>,
  passes: Pick<PassDef, "limits" | "features">[],
): { limits: Record<string, number>; features: Record<string, boolean> } {
  const l = { ...limits };
  const f = { ...features };
  for (const p of passes) {
    for (const [k, v] of Object.entries(p.limits)) l[k] = k in l ? maxLimit(l[k]!, v) : v;
    for (const [k, v] of Object.entries(p.features)) f[k] = (f[k] ?? false) || v;
  }
  return { limits: l, features: f };
}
