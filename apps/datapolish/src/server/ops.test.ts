import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { raiseIncident } from "@repo/ops";
import { CRON, makeApp, type App } from "./test/harness";

let app: App;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});

describe("scheduler", () => {
  it("a tick claims schedules, sends queued emails through the outbox (logged without Resend) and writes a heartbeat", async () => {
    await app.user("sched@example.com"); // queues a verification email
    const report = await app.p.scheduler.tick({ budgetMs: 10_000 });
    expect(report.errors).toEqual([]);
    const names = report.enqueued.map((e) => e.schedule);
    expect(names).toEqual(expect.arrayContaining(["billing.reconcile", "datapolish.cleanup", "ops.notify_owner"]));
    const { rows } = await app.p.handle.executor.query<{ status: string }>(`SELECT status FROM ops_email_outbox WHERE to_address = 'sched@example.com'`);
    expect(rows.every((r) => r.status === "logged")).toBe(true);
    const hb = await app.p.handle.executor.query(`SELECT 1 FROM ops_heartbeats WHERE name = 'scheduler'`);
    expect(hb.rows).toHaveLength(1);
  });

  it("/api/cron/tick requires the bearer secret", async () => {
    const tick = (h: Record<string, string>) => app.call((p, r) => app.routes.cronRouteHandler(p, r), "/api/cron/tick", { method: "POST", origin: null, headers: h });
    expect((await tick({})).status).toBe(401);
    expect((await tick({ authorization: "Bearer wrong-secret-wrong-secret" })).status).toBe(401);
    expect((await tick({ authorization: `Bearer ${CRON}` })).status).toBe(200);
  });
});

describe("health", () => {
  it("public health shows status and version only; details need the secret", async () => {
    const pub = (await (await app.call((p, r) => app.routes.healthRouteHandler(p, r), "/api/health")).json()) as Record<string, unknown>;
    expect(Object.keys(pub).sort()).toEqual(["status", "version"]);
    const full = (await (await app.call((p, r) => app.routes.healthRouteHandler(p, r), "/api/health", { headers: { authorization: `Bearer ${CRON}` } })).json()) as Record<string, unknown>;
    expect(full.checks).toBeDefined();
  });
});

describe("analytics events route", () => {
  it("stores only allow-listed props: no file names, cell values or free text, and never an IP", async () => {
    const r = await app.call((p, req) => app.routes.eventsRouteHandler(p, req), "/api/events", {
      body: {
        name: "tool_used",
        anonymousId: "anon_12345678",
        path: "/?file=secret.csv",
        props: { action: "download_csv", mode: "batch", files: 3, fileName: "payroll-2026.csv", cell: "Jane Doe", format: "Jane Doe", steps: "7" },
      },
    });
    expect(r.status).toBe(204);
    const { rows } = await app.p.handle.executor.query<{ props: Record<string, unknown>; path: string }>(`SELECT props, path FROM analytics_events WHERE anonymous_id = 'anon_12345678'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.props).toEqual({ action: "download_csv", mode: "batch", files: 3 });
    expect(rows[0]!.path).toBe("/");
    expect(JSON.stringify(rows[0])).not.toMatch(/payroll|Jane|secret/);
  });

  it("refuses cross-origin beacons and unknown event names", async () => {
    const cross = await app.call((p, req) => app.routes.eventsRouteHandler(p, req), "/api/events", { body: { name: "pageview" }, origin: "https://evil.example" });
    expect(cross.status).toBe(403);
    const unknown = await app.call((p, req) => app.routes.eventsRouteHandler(p, req), "/api/events", { body: { name: "file_uploaded" } });
    expect(unknown.status).toBe(400);
  });
});

describe("internal ops dashboard access", () => {
  it("customers get 404 from admin actions; operators can act", async () => {
    const u = await app.user("customer@example.com");
    const inc = await raiseIncident(app.p.handle.executor, { fingerprint: "test:incident", severity: "warning", source: "test", title: "Test incident" });
    const act = (jar: Map<string, string>, origin?: string) =>
      app.call((p, r) => app.routes.adminActionRoute(p, r), "/api/admin/actions", {
        jar,
        rawBody: new URLSearchParams({ action: "resolve", id: inc.id }).toString(),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        origin,
      });
    expect((await act(u.jar)).status).toBe(404);
    expect((await act(new Map())).status).toBe(404);
    expect(await app.routes.requireOperator(app.p, new Headers({ cookie: [...u.jar].map(([k, v]) => `${k}=${v}`).join("; ") }))).toBeNull();

    // Role is granted only in the database (README one-liner); it cannot be set through sign-up or update-user.
    const selfElevate = await app.auth("/update-user", { jar: u.jar, body: { role: "owner" } });
    expect(selfElevate.status).toBeGreaterThanOrEqual(400);
    await app.p.handle.executor.query(`UPDATE auth_user SET role = 'operator' WHERE id = $1`, [u.userId]);
    expect((await act(u.jar, "https://evil.example")).status).toBe(403);
    const ok = await act(u.jar);
    expect(ok.status).toBe(303);
    const { rows } = await app.p.handle.executor.query<{ status: string }>(`SELECT status FROM incidents WHERE id = $1`, [inc.id]);
    expect(rows[0]!.status).toBe("resolved");
  });
});
