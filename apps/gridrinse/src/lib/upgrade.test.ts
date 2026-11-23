import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GRIDRINSE_CATALOG, getFreePlan } from "@repo/billing";
import { offerFacts } from "@/components/UpgradeNotice";
import { pageMeta } from "@/lib/seo";
import { upgradeOffers } from "@/server/plans";
import { nextOffer, processingLimits } from "./limits";

const MB = 1024 * 1024;
const free = getFreePlan(GRIDRINSE_CATALOG);
const freeLimits = processingLimits(free.id, free.name, free.limits);

describe("upgrade prompts only claim what the plans give", () => {
  it("offers are the catalog's paid plans with their real limits and prices", () => {
    const offers = upgradeOffers();
    expect(offers.map((o) => o.planId)).toEqual(["pro", "business"]);
    const pro = offers[0]!;
    const proPlan = GRIDRINSE_CATALOG.plans.find((p) => p.id === "pro")!;
    expect(pro.priceMonthly).toBe(proPlan.priceMonthlyCents / 100);
    expect(pro.maxFileBytes).toBe(proPlan.limits.maxFileMb! * MB);
    expect(pro.maxRows).toBe(proPlan.limits.maxRows);
    expect(pro.maxFiles).toBe(proPlan.limits.filesPerBatch);
    expect(pro.savedWorkflows).toBe(proPlan.limits.savedWorkflows);
    expect(offerFacts(pro)).toEqual(["Files up to 50 MB", "500,000 rows per file", "20 files at once", "50 workflows saved to your account"]);
  });

  it("picks the cheapest plan that would really take the file, and none if no plan would", () => {
    const offers = upgradeOffers();
    expect(nextOffer(offers, freeLimits, { fileBytes: 6 * MB })?.planId).toBe("pro");
    expect(nextOffer(offers, freeLimits, { fileBytes: 120 * MB })?.planId).toBe("business");
    expect(nextOffer(offers, freeLimits, { fileBytes: 300 * MB })).toBeNull();
    expect(nextOffer(offers, freeLimits, { files: 5 })?.planId).toBe("pro");
    expect(nextOffer(offers, freeLimits, { files: 40 })?.planId).toBe("business");
    const pro = GRIDRINSE_CATALOG.plans.find((p) => p.id === "pro")!;
    expect(nextOffer(offers, processingLimits("pro", "Pro", pro.limits))?.planId).toBe("business");
  });
});

describe("SEO metadata", () => {
  it("pageMeta sets canonical, og:url, an og image and a large twitter card", () => {
    const m = pageMeta({ title: "Pricing", description: "d".repeat(100), path: "/pricing" });
    expect(m.alternates?.canonical).toBe("/pricing");
    const og = m.openGraph as { url: string; title: string; images: { url: string; width: number }[] };
    expect(og.url).toBe("/pricing");
    expect(og.title).toBe("Pricing · GridRinse");
    expect(og.images[0]).toMatchObject({ url: "/og/default.png", width: 1200 });
    expect((m.twitter as { card: string }).card).toBe("summary_large_image");
    expect((pageMeta({ title: "T", description: "d", path: "/tools/x", toolSlug: "x" }).openGraph as typeof og).images[0]!.url).toBe("/og/x.png");
  });
});

describe("page bundle stays light", () => {
  // SheetJS, Papa Parse and fflate belong in the engine worker (loaded with new Worker(), a separate bundle). A value
  // import that reaches them from a client component, even through other modules, puts ~200 KB (gzipped) of
  // JavaScript on every page and hurts mobile speed.
  const src = join(__dirname, "..");
  const HEAVY = new Set(["xlsx", "papaparse", "fflate"]);
  const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith("@/") ? join(src, spec.slice(2)) : spec.startsWith(".") ? join(from, "..", spec) : null;
    if (!base) return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(c) && statSync(c).isFile()) return c;
    return null;
  };
  /** Value imports and re-exports of a module (type-only ones are erased by the compiler). */
  const deps = (file: string): string[] =>
    [...readFileSync(file, "utf8").matchAll(/^(?:import|export) (?!type )[^;]*?from "([^"]+)";/gms)].map((m) => m[1]!);
  const reachesHeavy = (entry: string): string | null => {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const d of deps(f)) {
        if (HEAVY.has(d)) return `${f} -> ${d}`;
        const r = resolve(f, d);
        if (r) stack.push(r);
      }
    }
    return null;
  };
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
    });

  it("no client component reaches the parsing/export libraries", () => {
    const client = [...files(join(src, "components")), ...files(join(src, "app"))].filter((p) => readFileSync(p, "utf8").startsWith('"use client"'));
    expect(client.length).toBeGreaterThan(5);
    for (const p of client) expect(reachesHeavy(p), p).toBeNull();
    // The check itself works: the worker's protocol module does reach them.
    expect(reachesHeavy(join(src, "lib", "worker", "protocol.ts"))).not.toBeNull();
  });
});
