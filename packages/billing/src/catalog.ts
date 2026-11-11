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
  /** Stripe Price lookup key, e.g. "siteproof_solo_monthly". Absent for the free plan. */
  stripeLookupKey?: string;
  /** Numeric limits; -1 means unlimited. Every plan of a catalog has the same limit keys. */
  limits: Record<string, number>;
  /** Boolean features; every plan of a catalog has the same feature keys. */
  features: Record<string, boolean>;
}

export interface Catalog {
  /** App identifier, e.g. "siteproof". Also stored in Stripe metadata. */
  app: string;
  plans: PlanDef[];
  freePlanId: string;
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

export const catalogSchema = z
  .object({
    app: idSchema,
    plans: z.array(planDefSchema).min(1),
    freePlanId: idSchema,
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
