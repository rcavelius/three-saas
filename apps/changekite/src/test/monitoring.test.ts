/**
 * Recurring scans through scheduler.tick, alerts on meaningful change only, unreachable after 3 failures,
 * mute/recipients, retention cleanup, global leases, and cross-tenant isolation on every resource route.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, CRON_SECRET, healthySite, page, type Harness, type Jar } from "./harness";
import { GET as sitesGET, POST as sitesPOST } from "@/app/api/sites/route";
import { DELETE as siteDELETE, GET as siteGET, PATCH as sitePATCH } from "@/app/api/sites/[id]/route";
import { POST as scanNowPOST } from "@/app/api/sites/[id]/scan/route";
import { GET as reportGET } from "@/app/api/report/[id]/route";
import { GET as pdfGET } from "@/app/api/reports/[id]/pdf/route";
import { POST as cronPOST } from "@/app/api/cron/tick/route";
import { GET as healthGET } from "@/app/api/health/route";
import { POST as eventsPOST } from "@/app/api/events/route";
import { POST as adminIncidentPOST } from "@/app/api/admin/incidents/route";
import { acquireLease, releaseLease } from "@/lib/monitoring/monitor";
import { deleteExpiredScans, saveScan } from "@/lib/scans-repo";
import { isOperator } from "@/lib/http";

let h: Harness;
let alice: { jar: Jar; userId: string; orgId: string };
let bob: { jar: Jar; userId: string; orgId: string };
let siteId: string;
const HOST = "shop.example.com";
const HOUR = 3_600_000;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await h.p.handle.executor.query<T>(sql, params)).rows;
}
async function tick() {
  return h.p.scheduler.tick({ budgetMs: 30_000 });
}
async function alertsFor(id: string) {
  return q<{ kind: string; title: string; status: string; recipients: string[] }>(
    `SELECT kind, title, status, recipients FROM alerts WHERE site_id = $1 ORDER BY created_at`,
    [id],
  );
}
async function alertMails(to: string) {
  return (await h.outbox(to)).filter((m) => m.tag.startsWith("site_alert_"));
}

beforeAll(async () => {
  h = await createHarness();
  alice = await h.signUpVerified("alice@example.com", "Alice");
  bob = await h.signUpVerified("bob@example.com", "Bob");
  await h.subscribe(alice.jar, "agency");
  await h.subscribe(bob.jar, "solo");
  h.web.set(HOST, healthySite());
  const r = await h.call(sitesPOST, "POST", "/api/sites", { jar: alice.jar, body: { url: `https://${HOST}/` } });
  expect(r.status).toBe(201);
  siteId = ((await r.json()) as { site: { id: string } }).site.id;
});
afterAll(async () => {
  await h.close();
});

describe("scheduled scans and alerts", () => {
  it("the first tick schedules and runs the scan (baseline: no alert)", async () => {
    const rep = await tick();
    expect(rep.enqueued.map((e) => e.queue)).toContain("sites.schedule");
    const scans = await q<{ org_id: string; site_id: string; reachable: boolean }>(`SELECT org_id, site_id::text AS site_id, reachable FROM scans WHERE site_id = $1`, [siteId]);
    expect(scans).toEqual([{ org_id: alice.orgId, site_id: siteId, reachable: true }]);
    const site = await q<{ status: string; next_scan_at: Date; last_score: number }>(`SELECT status, next_scan_at, last_score FROM sites WHERE id = $1`, [siteId]);
    expect(site[0]!.status).toBe("ok");
    // Agency scans every 6 hours
    expect(new Date(site[0]!.next_scan_at).getTime() - Date.now() - h.clock.offsetMs).toBeGreaterThan(5.9 * HOUR);
    expect(await alertsFor(siteId)).toEqual([]);
  });

  it("nothing is scanned again before the plan interval", async () => {
    h.clock.advance(2 * HOUR);
    await tick();
    expect((await q(`SELECT 1 FROM scans WHERE site_id = $1`, [siteId])).length).toBe(1);
  });

  it("a new broken link -> one alert email to org members; the same unresolved issue never repeats", async () => {
    h.web.set(HOST, { ...healthySite(), "/": { status: 200, body: page("Home", ["/about", "/contact", "/gone"]) } });
    h.clock.advance(5 * HOUR);
    await tick();
    const alerts = await alertsFor(siteId);
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toMatchObject({ kind: "change", status: "sent" });
    expect(alerts[0]!.recipients).toEqual([alice.userId]);
    const mails = await alertMails("alice@example.com");
    expect(mails.length).toBe(1);
    expect(mails[0]!.subject).toContain(HOST);
    expect(mails[0]!.text_body).toContain("https://shop.example.com/gone");
    expect((await alertMails("bob@example.com")).length).toBe(0);

    h.clock.advance(6 * HOUR + 60_000);
    await tick();
    expect((await q(`SELECT 1 FROM scans WHERE site_id = $1`, [siteId])).length).toBe(3);
    expect((await alertsFor(siteId)).length).toBe(1);
  });

  it("fixing the critical sends a 'resolved' email", async () => {
    h.web.set(HOST, healthySite());
    h.clock.advance(6 * HOUR + 60_000);
    await tick();
    const alerts = await alertsFor(siteId);
    expect(alerts.map((a) => a.kind)).toEqual(["change", "resolved"]);
    expect((await alertMails("alice@example.com")).map((m) => m.tag)).toEqual(["site_alert_change", "site_alert_resolved"]);
  });

  it("certificate expiring < 14 days and robots blocking everything are alerted once", async () => {
    h.certDays.value = 9;
    h.web.set(HOST, { ...healthySite(), "/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /\n", headers: { "content-type": "text/plain" } } });
    h.clock.advance(6 * HOUR + 60_000);
    const rep = await tick();
    expect(rep.errors).toEqual([]);
    const last = (await alertsFor(siteId)).at(-1)!;
    expect(last.kind).toBe("change");
    const { rows } = await h.p.handle.executor.query<{ details: { events: { kind: string }[] } }>(
      `SELECT details FROM alerts WHERE site_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [siteId],
    );
    const kinds = rows[0]!.details.events.map((e) => e.kind);
    expect(kinds).toContain("cert_expiring");
    expect(kinds).toContain("robots_blocks_all");
    const count = (await alertsFor(siteId)).length;
    h.clock.advance(6 * HOUR + 60_000);
    await tick();
    expect((await alertsFor(siteId)).length).toBe(count);
    h.certDays.value = 120;
    h.web.set(HOST, healthySite());
    h.clock.advance(6 * HOUR + 60_000);
    await tick();
  });

  it("3 failed attempts in a row (queue retries with backoff) -> unreachable + one alert; recovery -> 'back up'", async () => {
    const before = (await alertsFor(siteId)).length;
    h.web.set(HOST, "down");
    h.clock.advance(6 * HOUR + 60_000);
    const rep1 = await tick(); // attempt 1 fails, retried in 30 s
    expect(rep1.retried).toBe(1);
    let site = (await q<{ status: string; consecutive_failures: number }>(`SELECT status, consecutive_failures FROM sites WHERE id = $1`, [siteId]))[0]!;
    expect(site).toEqual({ status: "ok", consecutive_failures: 1 });
    h.clock.advance(31_000);
    await tick(); // attempt 2, retried in 60 s
    h.clock.advance(61_000);
    await tick(); // attempt 3 -> unreachable
    site = (await q<{ status: string; consecutive_failures: number }>(`SELECT status, consecutive_failures FROM sites WHERE id = $1`, [siteId]))[0]!;
    expect(site).toEqual({ status: "unreachable", consecutive_failures: 3 });
    const alerts = await alertsFor(siteId);
    expect(alerts.length).toBe(before + 1);
    expect(alerts.at(-1)!.title).toBe("Site unreachable");
    // open issues are kept while the site is down (no flood of "resolved")
    expect(alerts.at(-1)!.kind).toBe("change");

    h.web.set(HOST, healthySite());
    h.clock.advance(6 * HOUR + 60_000);
    await tick();
    const after = await alertsFor(siteId);
    expect(after.at(-1)!.title).toBe("Site is back up");
    expect((await q<{ status: string }>(`SELECT status FROM sites WHERE id = $1`, [siteId]))[0]!.status).toBe("ok");
  });

  it("muted sites record alerts without emailing; recipients must be org members", async () => {
    const bad = await h.call(sitePATCH, "PATCH", `/api/sites/${siteId}`, { jar: alice.jar, params: { id: siteId }, body: { alertRecipients: [bob.userId] } });
    expect(bad.status).toBe(400);
    const mute = await h.call(sitePATCH, "PATCH", `/api/sites/${siteId}`, { jar: alice.jar, params: { id: siteId }, body: { alertsMuted: true, alertRecipients: [alice.userId] } });
    expect(mute.status).toBe(200);
    const mailsBefore = (await alertMails("alice@example.com")).length;
    h.web.set(HOST, { ...healthySite(), "/": { status: 500, body: "oops" } });
    h.clock.advance(6 * HOUR + 60_000);
    await tick();
    expect((await alertsFor(siteId)).at(-1)!.status).toBe("muted");
    expect((await alertMails("alice@example.com")).length).toBe(mailsBefore);
    await h.call(sitePATCH, "PATCH", `/api/sites/${siteId}`, { jar: alice.jar, params: { id: siteId }, body: { alertsMuted: false } });
    h.web.set(HOST, healthySite());
  });

  it("scan-now queues one job and is rate limited", async () => {
    const r1 = await h.call(scanNowPOST, "POST", `/api/sites/${siteId}/scan`, { jar: alice.jar, params: { id: siteId } });
    expect(r1.status).toBe(202);
    const r2 = await h.call(scanNowPOST, "POST", `/api/sites/${siteId}/scan`, { jar: alice.jar, params: { id: siteId } });
    expect((await r2.json()).status).toBe("already_queued");
    await tick();
  });

  it("cron tick route requires the bearer secret", async () => {
    expect((await h.call(cronPOST, "POST", "/api/cron/tick")).status).toBe(401);
    const ok = await h.call(cronPOST, "POST", "/api/cron/tick", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(ok.status).toBe(200);
  });
});

describe("cross-tenant isolation: user B gets 404 for user A's resources on every route", () => {
  let scanId: string;
  beforeAll(async () => {
    scanId = (await q<{ id: string }>(`SELECT id FROM scans WHERE site_id = $1 ORDER BY created_at DESC LIMIT 1`, [siteId]))[0]!.id;
  });

  it("sites: read, update, delete, scan-now", async () => {
    const o = { jar: bob.jar, params: { id: siteId } };
    expect((await h.call(siteGET, "GET", `/api/sites/${siteId}`, o)).status).toBe(404);
    expect((await h.call(sitePATCH, "PATCH", `/api/sites/${siteId}`, { ...o, body: { paused: true } })).status).toBe(404);
    expect((await h.call(siteDELETE, "DELETE", `/api/sites/${siteId}`, o)).status).toBe(404);
    expect((await h.call(scanNowPOST, "POST", `/api/sites/${siteId}/scan`, o)).status).toBe(404);
    const list = (await (await h.call(sitesGET, "GET", "/api/sites", { jar: bob.jar })).json()) as { sites: unknown[] };
    expect(list.sites).toEqual([]);
    // the site is untouched
    expect((await q<{ paused: boolean }>(`SELECT paused FROM sites WHERE id = $1`, [siteId]))[0]!.paused).toBe(false);
  });

  it("reports: JSON export and PDF download; anonymous visitors too", async () => {
    expect((await h.call(reportGET, "GET", `/api/report/${scanId}`, { jar: bob.jar, params: { id: scanId } })).status).toBe(404);
    expect((await h.call(reportGET, "GET", `/api/report/${scanId}`, { params: { id: scanId } })).status).toBe(404);
    expect((await h.call(pdfGET, "GET", `/api/reports/${scanId}/pdf`, { jar: bob.jar, params: { id: scanId } })).status).toBe(404);
    const own = await h.call(reportGET, "GET", `/api/report/${scanId}`, { jar: alice.jar, params: { id: scanId } });
    expect(own.status).toBe(200);
  });

  it("an org id in the request body or query is ignored", async () => {
    const r = await h.call(sitesGET, "GET", `/api/sites?orgId=${alice.orgId}`, { jar: bob.jar });
    expect(((await r.json()) as { sites: unknown[] }).sites).toEqual([]);
  });
});

describe("PDF export", () => {
  it("Agency members get a real PDF; Solo orgs are told to use Print", async () => {
    const scanId = (await q<{ id: string }>(`SELECT id FROM scans WHERE site_id = $1 ORDER BY created_at DESC LIMIT 1`, [siteId]))[0]!.id;
    const res = await h.call(pdfGET, "GET", `/api/reports/${scanId}/pdf`, { jar: alice.jar, params: { id: scanId } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);

    h.web.set("bobsite.example.com", healthySite());
    const add = await h.call(sitesPOST, "POST", "/api/sites", { jar: bob.jar, body: { url: "bobsite.example.com" } });
    const bobSite = ((await add.json()) as { site: { id: string } }).site.id;
    h.clock.advance(61_000);
    await tick();
    const bobScan = (await q<{ id: string }>(`SELECT id FROM scans WHERE site_id = $1`, [bobSite]))[0]!.id;
    const solo = await h.call(pdfGET, "GET", `/api/reports/${bobScan}/pdf`, { jar: bob.jar, params: { id: bobScan } });
    expect(solo.status).toBe(403);
  });
});

describe("retention", () => {
  it("expired anonymous scans and old account scans are deleted in batches; each site's latest scan is kept", async () => {
    const report = (await q<{ report: unknown }>(`SELECT report FROM scans WHERE site_id = $1 LIMIT 1`, [siteId]))[0]!.report as never;
    const now = new Date(Date.now() + h.clock.offsetMs);
    const anon = await saveScan(h.p.handle.executor, report, { retentionDays: 1, now: new Date(now.getTime() - 3 * 86_400_000) });
    await h.p.handle.executor.query(`UPDATE scans SET expires_at = $2 WHERE site_id = $1`, [siteId, new Date(now.getTime() - 1000).toISOString()]);
    const latest = (await q<{ last_scan_id: string }>(`SELECT last_scan_id FROM sites WHERE id = $1`, [siteId]))[0]!.last_scan_id;
    const n = await deleteExpiredScans(h.p.handle.executor, { now, batchSize: 2 });
    expect(n).toBeGreaterThan(2);
    const left = await q<{ id: string }>(`SELECT id FROM scans WHERE site_id = $1`, [siteId]);
    expect(left.map((r) => r.id)).toEqual([latest]);
    expect((await q(`SELECT 1 FROM scans WHERE id = $1`, [anon])).length).toBe(0);
  });
});

describe("global concurrency leases", () => {
  it("never hands out more than the cap; expired leases are reclaimed", async () => {
    const ex = h.p.handle.executor;
    const now = new Date();
    const a = await acquireLease(ex, 2, "a", now, 60_000);
    const b = await acquireLease(ex, 2, "b", now, 60_000);
    expect(new Set([a, b])).toEqual(new Set([0, 1]));
    expect(await acquireLease(ex, 2, "c", now, 60_000)).toBeNull();
    expect(await acquireLease(ex, 2, "d", new Date(now.getTime() + 61_000), 60_000)).not.toBeNull();
    await releaseLease(ex, a!, "a");
    await ex.query(`DELETE FROM scan_leases`);
  });
});

describe("ops routes", () => {
  it("/api/health is minimal for the public", async () => {
    const res = await h.call(healthGET, "GET", "/api/health");
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["status", "version"]);
  });

  it("/api/events refuses cross-origin beacons and accepts same-origin ones", async () => {
    expect((await h.call(eventsPOST, "POST", "/api/events", { body: { name: "pageview" }, origin: "https://evil.example" })).status).toBe(403);
    expect((await h.call(eventsPOST, "POST", "/api/events", { body: { name: "pageview", path: "/" } })).status).toBe(204);
  });

  it("/admin actions are 404 for customers and work for operators", async () => {
    const r = await h.call(adminIncidentPOST, "POST", "/api/admin/incidents", { jar: alice.jar, form: { id: "00000000-0000-0000-0000-000000000000", op: "resolve" } });
    expect(r.status).toBe(404);
    expect(await isOperator(h.p, new Headers({ cookie: [...alice.jar].map(([k, v]) => `${k}=${v}`).join("; ") }))).toBeNull();
    await h.p.handle.executor.query(`UPDATE auth_user SET role = 'operator' WHERE id = $1`, [alice.userId]);
    const ok = await h.call(adminIncidentPOST, "POST", "/api/admin/incidents", { jar: alice.jar, form: { id: "00000000-0000-0000-0000-000000000000", op: "resolve" } });
    expect(ok.status).toBe(303);
    await h.p.handle.executor.query(`UPDATE auth_user SET role = 'customer' WHERE id = $1`, [alice.userId]);
  });
});
