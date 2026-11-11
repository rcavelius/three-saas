import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { enqueueJob, type DbHandle } from "@repo/database";
import { healthReport, publicHealth, runUptimeCheck, uptimeUrlsFromEnv } from "./health";
import { getOpenIncident, raiseIncident } from "./incidents";
import { writeHeartbeat } from "./state";
import type { FetchLike } from "./types";
import { makeDb } from "./test/fixtures";

let handle: DbHandle<any>;
const ex = () => handle.executor;
const now = new Date("2026-06-01T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

beforeAll(async () => {
  handle = await makeDb({ withAuthBilling: false });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await ex().exec(`DELETE FROM jobs; DELETE FROM incidents; DELETE FROM ops_heartbeats; DELETE FROM ops_email_outbox; DELETE FROM ops_settings;`);
});

describe("healthReport", () => {
  it("is ok with a fresh heartbeat and nothing wrong", async () => {
    await writeHeartbeat(ex(), "scheduler", {}, ago(60_000));
    const r = await healthReport(handle, { now, version: "1.2.3" });
    expect(r.status).toBe("ok");
    expect(r.reasons).toEqual([]);
    expect(r.checks.db.ok).toBe(true);
    expect(r.checks.scheduler).toMatchObject({ ageSeconds: 60, stale: false });
    expect(publicHealth(r)).toEqual({ status: "ok", version: "1.2.3" });
  });

  it("is degraded when the scheduler never ran or is older than 5 minutes", async () => {
    expect((await healthReport(handle, { now })).status).toBe("degraded");
    await writeHeartbeat(ex(), "scheduler", {}, ago(5 * 60_000 + 1_000));
    const r = await healthReport(handle, { now });
    expect(r.status).toBe("degraded");
    expect(r.reasons[0]).toMatch(/heartbeat is 301s old/);
  });

  it("reports backlog, oldest queued age, dead letters, email failures and open criticals", async () => {
    await writeHeartbeat(ex(), "scheduler", {}, now);
    await enqueueJob(ex(), "q", {}, { runAt: ago(20 * 60_000) });
    await enqueueJob(ex(), "q", {}, { runAt: ago(1_000) });
    await enqueueJob(ex(), "q", {}, { runAt: new Date(now.getTime() + 60_000) }); // not due: not backlog
    await ex().query(`INSERT INTO jobs (queue, status, finished_at) VALUES ('q', 'failed', $1), ('q', 'failed', $2)`, [
      ago(3_600_000).toISOString(),
      ago(48 * 3_600_000).toISOString(),
    ]);
    await ex().query(
      `INSERT INTO ops_email_outbox (to_address, subject, text_body, html_body, tag, status, created_at)
       VALUES ('a@b.c', 's', 't', 'h', 'x', 'failed', $1), ('a@b.c', 's', 't', 'h', 'x', 'queued', $1)`,
      [ago(1_000).toISOString()],
    );
    await raiseIncident(ex(), { fingerprint: "c", severity: "critical", source: "t", title: "c" });
    const r = await healthReport(handle, { now, version: "v" });
    expect(r.status).toBe("degraded");
    expect(r.checks.queue).toEqual({ backlog: 2, oldestQueuedAgeSeconds: 1200 });
    expect(r.checks.deadLetters24h).toBe(1);
    expect(r.checks.emailOutbox).toEqual({ failed24h: 1, pending: 1 });
    expect(r.checks.openCriticalIncidents).toBe(1);
    expect(r.reasons).toHaveLength(4);
    // Public shape reveals nothing beyond status + version.
    expect(Object.keys(publicHealth(r)).sort()).toEqual(["status", "version"]);
  });

  it("is down when the database does not answer in time", async () => {
    const hanging = { executor: { exec: async () => {}, query: () => new Promise<never>(() => {}) } };
    const r = await healthReport(hanging as never, { now, dbTimeoutMs: 20 });
    expect(r.status).toBe("down");
    expect(r.checks.db.ok).toBe(false);
    const failing = { executor: { exec: async () => {}, query: async () => Promise.reject(new Error("ECONNREFUSED")) } };
    expect((await healthReport(failing as never, { now })).status).toBe("down");
  });
});

describe("uptime check", () => {
  it("parses owner-configured URLs only", () => {
    expect(uptimeUrlsFromEnv("https://a.example/api/health, ftp://x, notaurl, http://u:p@b.example/, http://c.example")).toEqual([
      "https://a.example/api/health",
      "http://c.example",
    ]);
    expect(uptimeUrlsFromEnv(undefined)).toEqual([]);
  });

  it("raises a critical incident after 2 consecutive failures and auto-resolves on recovery", async () => {
    const url = "https://app.example/api/health";
    let mode: "ok" | "500" | "throw" = "500";
    const calls: string[] = [];
    const f: FetchLike = async (u) => {
      calls.push(u);
      if (mode === "throw") throw new Error("timeout");
      return new Response("x", { status: mode === "ok" ? 200 : 500 });
    };
    let r = await runUptimeCheck(ex(), { urls: [url], fetch: f, now });
    expect(r[0]).toMatchObject({ ok: false, status: 500, consecutiveFailures: 1 });
    expect(await getOpenIncident(ex(), `uptime:${url}`)).toBeNull();
    mode = "throw";
    r = await runUptimeCheck(ex(), { urls: [url], fetch: f, now });
    expect(r[0]).toMatchObject({ ok: false, status: null, consecutiveFailures: 2 });
    expect((await getOpenIncident(ex(), `uptime:${url}`))?.severity).toBe("critical");
    mode = "ok";
    r = await runUptimeCheck(ex(), { urls: [url], fetch: f, now });
    expect(r[0]).toMatchObject({ ok: true, consecutiveFailures: 0 });
    expect(await getOpenIncident(ex(), `uptime:${url}`)).toBeNull();
    expect(calls).toEqual([url, url, url]);
  });

  it("a single blip does not raise an incident", async () => {
    const url = "https://b.example/";
    let fail = true;
    const f: FetchLike = async () => new Response(null, { status: fail ? 502 : 204 });
    await runUptimeCheck(ex(), { urls: [url], fetch: f, now });
    fail = false;
    await runUptimeCheck(ex(), { urls: [url], fetch: f, now });
    fail = true;
    await runUptimeCheck(ex(), { urls: [url], fetch: f, now });
    expect(await getOpenIncident(ex(), `uptime:${url}`)).toBeNull();
  });
});
