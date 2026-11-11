/**
 * Behaviour that PGlite cannot prove (it has one connection): real multi-connection concurrency on
 * PostgreSQL, the node-postgres driver path, and every app's full migration chain.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, CORE_MIGRATIONS, claimJobs, enqueueJob, rateLimit, type DbHandle } from "@repo/database";
import { AUTH_MIGRATIONS, createAuth, type EmailMessage } from "@repo/auth";
import { BILLING_MIGRATIONS, createBilling, defineCatalog, notConfiguredGateway } from "@repo/billing";
import { OPS_MIGRATIONS, createScheduler } from "@repo/ops";
import { CHANGEKITE_MIGRATIONS } from "../../../apps/changekite/src/lib/migrations";
import { WEBHOOKTRAIL_MIGRATIONS } from "../../../apps/webhooktrail/src/lib/migrations";
import { APP_MIGRATIONS as DATAPOLISH_MIGRATIONS } from "../../../apps/datapolish/src/server/migrations";
import { freshDatabase, hasPg, instances } from "./pg";

const SHARED = [...CORE_MIGRATIONS, ...AUTH_MIGRATIONS, ...BILLING_MIGRATIONS, ...OPS_MIGRATIONS];

describe.skipIf(!hasPg)("real PostgreSQL", () => {
  let db: { url: string; drop: () => Promise<void> };
  let handles: DbHandle<Record<string, unknown>>[] = [];

  beforeAll(async () => {
    db = await freshDatabase();
    handles = instances(db.url, 4);
    expect(handles[0]!.driver).toBe("pg");
    await handles[0]!.migrate(SHARED);
  });
  afterAll(async () => {
    await Promise.all(handles.map((h) => h.close()));
    await db.drop();
  });

  it.each([
    ["changekite", CHANGEKITE_MIGRATIONS],
    ["datapolish", DATAPOLISH_MIGRATIONS],
    ["webhooktrail", WEBHOOKTRAIL_MIGRATIONS],
  ])("%s: full migration chain applies on a fresh database and is idempotent", async (_name, appMigrations) => {
    const own = await freshDatabase();
    const h = createDb(own.url, {});
    try {
      const applied = await h.migrate([...SHARED, ...appMigrations]);
      expect(applied.length).toBe(SHARED.length + appMigrations.length);
      expect(await h.migrate([...SHARED, ...appMigrations])).toEqual([]);
    } finally {
      await h.close();
      await own.drop();
    }
  });

  it("concurrent migrate() from several booting instances applies each migration exactly once", async () => {
    const own = await freshDatabase();
    const hs = instances(own.url, 3);
    try {
      const results = await Promise.all(hs.map((h) => h.migrate(SHARED)));
      // The advisory lock serialises them: one instance applies everything, the others find nothing to do.
      expect(results.map((r) => r.length).sort((a, b) => a - b)).toEqual([0, 0, SHARED.length]);
      expect(await hs[0]!.migrate(SHARED)).toEqual([]);
      const { rows } = await hs[0]!.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM _migrations`);
      expect(rows[0]!.n).toBe(SHARED.length);
    } finally {
      await Promise.all(hs.map((h) => h.close()));
      await own.drop();
    }
  });

  it("job claims across 4 instances x 10 concurrent workers: every job claimed exactly once", async () => {
    const ex = handles[0]!.executor;
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) ids.add(await enqueueJob(ex, "it.claims", { i }));
    const claimed: string[] = [];
    await Promise.all(
      Array.from({ length: 40 }, async (_, w) => {
        const h = handles[w % handles.length]!;
        for (;;) {
          const jobs = await claimJobs(h.executor, "it.claims", `w${w}`, 2);
          if (jobs.length === 0) return;
          claimed.push(...jobs.map((j) => j.id));
        }
      }),
    );
    expect(claimed.length).toBe(60);
    expect(new Set(claimed)).toEqual(ids);
  });

  it("rate limit is exact under 100 concurrent requests from 4 instances", async () => {
    const t = new Date("2026-01-01T00:00:30Z");
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => rateLimit(handles[i % 4]!.executor, "it:ip", 25, 60_000, t)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(25);
  });

  it("usage quota never exceeds the limit under 80 concurrent consumers on 4 instances", async () => {
    const catalog = defineCatalog({
      app: "it",
      freePlanId: "free",
      plans: [{ id: "free", name: "Free", priceMonthlyCents: 0, limits: { calls: 30 }, features: {} }],
    });
    const billings = handles.map((h) => createBilling({ handle: h, catalog, stripe: notConfiguredGateway(), appUrl: "https://it.test" }));
    const results = await Promise.all(
      Array.from({ length: 80 }, (_, i) => billings[i % 4]!.consumeUsage("org_it", "calls", 1)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(30);
    expect(await billings[0]!.getUsage("org_it", "calls")).toBe(30);
  });

  it("scheduler: 4 instances ticking at once enqueue a due schedule exactly once", async () => {
    let runs = 0;
    const schedulers = handles.map((h, i) =>
      createScheduler({
        handle: h,
        workerId: `inst${i}`,
        jobs: { "it.tick": async () => void runs++ },
        schedules: [{ name: "it.tick", intervalSeconds: 3600 }],
      }),
    );
    await Promise.all(schedulers.map((s) => s.tick({ budgetMs: 5_000 })));
    await Promise.all(schedulers.map((s) => s.tick({ budgetMs: 5_000 })));
    expect(runs).toBe(1);
  });

  it("Better Auth on node-postgres: sign-up, verification link, session", async () => {
    const emails: EmailMessage[] = [];
    const auth = createAuth({
      handle: handles[1]!,
      appName: "IntegrationTest",
      baseURL: "http://localhost:3999",
      secret: "integration-secret-integration-secret-0123",
      cookiePrefix: "it",
      sendEmail: async (m) => void emails.push(m),
    });
    const post = (path: string, body: unknown) =>
      auth.handler(
        new Request(`http://localhost:3999/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3999", "x-forwarded-for": "203.0.113.9" },
          body: JSON.stringify(body),
        }),
      );
    const r = await post("/sign-up/email", { email: "pg-user@example.com", password: "correct horse battery", name: "PG User" });
    expect(r.status).toBe(200);
    const link = emails.find((e) => e.tag === "auth.verify-email")!.text.match(/https?:\/\/\S+/)![0];
    const v = await auth.handler(new Request(link, { headers: { "x-forwarded-for": "203.0.113.9" } }));
    expect(v.status).toBeLessThan(400);
    const cookie = v.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const session = await auth.getSession(new Headers({ cookie }));
    expect(session?.user.email).toBe("pg-user@example.com");
    // Personal organization created through the pg driver as well.
    const org = await auth.requireOrg(new Headers({ cookie }));
    expect(org.role).toBe("owner");
  });
});
