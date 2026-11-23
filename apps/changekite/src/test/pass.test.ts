/**
 * One-time "Full-site report" pass end to end through the app's real routes with FakeStripe:
 * free scan is locked server-side (scan response, JSON export, PDF) -> anonymous visitor buys the pass ->
 * webhook -> claim route sets the signed cookie -> the same report unlocks, scans go to 250 pages, PDF works.
 * Expired and refunded passes fall back to free; a forged cookie is ignored.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, page, virtualDeps, type Harness, type Jar } from "./harness";
import { GET as reportJsonGET } from "@/app/api/report/[id]/route";
import { GET as pdfGET } from "@/app/api/reports/[id]/pdf/route";
import { passCheckoutHandler, passClaimHandler } from "@/lib/billing-routes";
import { eventsHandler } from "@/lib/ops-routes";
import { createScanHandler, ScanSlots } from "@/lib/scan-handler";
import { visitorAccess } from "@/lib/access";
import { PASS_COOKIE_NAME } from "@/lib/platform";

let h: Harness;
let scan: (req: Request) => Promise<Response>;

const BROKEN = ["/gone-1", "/gone-2", "/gone-3", "/gone-4", "/gone-5", "/gone-6"];

beforeAll(async () => {
  h = await createHarness();
  // Home page links to six missing pages: six critical broken links plus other findings.
  h.web.set("broken.example.com", {
    "/": { status: 200, body: page("Home", BROKEN) },
    "/robots.txt": { status: 200, body: "User-agent: *\nAllow: /\n", headers: { "content-type": "text/plain" } },
  });
  scan = createScanHandler({
    getExecutor: async () => h.p.handle.executor,
    scanDeps: () => virtualDeps(h.web),
    slots: new ScanSlots(4),
    ipLimitPerHour: 100,
    targetLimitPerHour: 100,
    retentionDays: 90,
    clientIp: h.p.clientIp,
    appUrl: "http://localhost:3101",
    scanOptions: { limits: { delayMs: 0, timeBudgetMs: 20_000 } },
    resolveAccess: async (req) => (await visitorAccess(h.p, req.headers)).ents,
  });
});
afterAll(async () => {
  await h.close();
});

interface ScanResult {
  id: string;
  report: { issues: { page: string | null; message: string }[]; limits: { maxPages: number }; pages: unknown[]; counts: Record<string, number> };
  locked: { hidden: number; total: number } | null;
}

async function runScan(jar?: Jar): Promise<ScanResult> {
  const res = await h.call(scan, "POST", "/api/scan", { jar, body: { url: "https://broken.example.com/" }, headers: { host: "localhost:3101" } });
  expect(res.status).toBe(200);
  return (await res.json()) as ScanResult;
}

async function reportJson(id: string, jar?: Jar) {
  const res = await h.call(reportJsonGET, "GET", `/api/report/${id}`, { jar, params: { id } });
  expect(res.status).toBe(200);
  const text = await res.text();
  return { text, body: JSON.parse(text) as { report: ScanResult["report"]; locked?: ScanResult["locked"] } };
}

/** Anonymous visitor buys the pass from a report; returns the session id and payment intent. */
async function buyPass(jar: Jar, reportId: string) {
  const res = await h.call(passCheckoutHandler, "POST", "/api/billing/pass/checkout", { jar, body: { passId: "report", returnPath: `/report/${reportId}` } });
  expect(res.status).toBe(200);
  const { url } = (await res.json()) as { url: string };
  const sessionId = url.split("/").pop()!;
  const pi = h.stripe.completePassCheckout(sessionId);
  expect(await h.deliverWebhooks()).toEqual([200]);
  const claim = await h.call(passClaimHandler, "GET", `/api/billing/pass/claim?session_id=${sessionId}&next=${encodeURIComponent(`/report/${reportId}`)}`, {
    jar,
    origin: null,
  });
  expect(claim.status).toBe(303);
  return { sessionId, pi, location: claim.headers.get("location") };
}

describe("free report lock and the Full-site report pass", () => {
  let free: ScanResult;
  const buyer: Jar = new Map();

  it("a free scan returns only the top 3 issues and counts of the rest, everywhere it is served", async () => {
    free = await runScan();
    expect(free.report.limits.maxPages).toBe(25);
    expect(free.report.issues).toHaveLength(3);
    expect(free.locked).not.toBeNull();
    expect(free.locked!.hidden).toBeGreaterThanOrEqual(3);
    expect(free.report.pages).toEqual([]);

    const { text, body } = await reportJson(free.id);
    expect(body.report.issues).toHaveLength(3);
    expect(body.locked!.total).toBe(free.locked!.total);
    // Broken-link issues beyond the top 3 never leave the server.
    const shown = new Set(body.report.issues.map((i) => i.message));
    const hiddenTargets = BROKEN.filter((p) => ![...shown].some((m) => m.includes(p)));
    expect(hiddenTargets.length).toBeGreaterThan(0);
    for (const p of hiddenTargets) expect(text).not.toContain(`https://broken.example.com${p}`);

    const pdf = await h.call(pdfGET, "GET", `/api/reports/${free.id}/pdf`, { params: { id: free.id } });
    expect(pdf.status).toBe(403);
  });

  it("anonymous checkout -> webhook -> claim sets a signed cookie and unlocks the same report", async () => {
    const { location } = await buyPass(buyer, free.id);
    expect(location).toBe(`/report/${free.id}?pass=active`);
    expect(buyer.get(PASS_COOKIE_NAME)).toMatch(/^cs_test_/);

    const ents = (await visitorAccess(h.p, new Headers({ cookie: `${PASS_COOKIE_NAME}=${buyer.get(PASS_COOKIE_NAME)}` }))).ents;
    expect(ents.pass?.passId).toBe("report");
    expect(ents.features.fullReport).toBe(true);
    expect(ents.features.pdfReports).toBe(true);
    expect(ents.limits.reportIssues).toBe(-1);
    expect(ents.limits.pagesPerScan).toBe(250);

    const { body } = await reportJson(free.id, buyer);
    expect(body.locked).toBeUndefined();
    expect(body.report.issues.length).toBe(free.locked!.total);
    for (const p of BROKEN) expect(JSON.stringify(body)).toContain(`https://broken.example.com${p}`);

    const pdf = await h.call(pdfGET, "GET", `/api/reports/${free.id}/pdf`, { jar: buyer, params: { id: free.id } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
  });

  it("with the pass, new scans use the pass page cap and come back unlocked", async () => {
    const r = await runScan(buyer);
    expect(r.report.limits.maxPages).toBe(250);
    expect(r.locked).toBeNull();
    expect(r.report.issues.length).toBe(free.locked!.total);
  });

  it("a forged or tampered pass cookie is ignored", async () => {
    const real = buyer.get(PASS_COOKIE_NAME)!;
    const sessionId = real.slice(0, real.lastIndexOf("."));
    for (const value of [sessionId, `${sessionId}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, `cs_test_doesnotexist.${real.slice(real.lastIndexOf(".") + 1)}`]) {
      const jar: Jar = new Map([[PASS_COOKIE_NAME, value]]);
      const { body } = await reportJson(free.id, jar);
      expect(body.report.issues, value).toHaveLength(3);
      expect(body.locked).toBeTruthy();
    }
    // A claim link with a made-up session id unlocks nothing.
    const jar: Jar = new Map();
    const claim = await h.call(passClaimHandler, "GET", `/api/billing/pass/claim?session_id=cs_test_madeup123&next=/report/${free.id}`, { jar, origin: null });
    expect(claim.headers.get("location")).toBe(`/report/${free.id}?pass=invalid`);
    expect(jar.has(PASS_COOKIE_NAME)).toBe(false);
  });

  it("the unlock link works on another device", async () => {
    const sessionId = buyer.get(PASS_COOKIE_NAME)!.split(".")[0]!;
    const other: Jar = new Map();
    const claim = await h.call(passClaimHandler, "GET", `/api/billing/pass/claim?session_id=${sessionId}&next=/report/${free.id}`, { jar: other, origin: null });
    expect(claim.headers.get("location")).toBe(`/report/${free.id}?pass=active`);
    const { body } = await reportJson(free.id, other);
    expect(body.locked).toBeUndefined();
  });

  it("a refunded pass stops unlocking", async () => {
    const jar: Jar = new Map();
    const { pi } = await buyPass(jar, free.id);
    expect((await reportJson(free.id, jar)).body.locked).toBeUndefined();
    h.stripe.refundPayment(pi);
    expect(await h.deliverWebhooks()).toEqual([200]);
    const { body } = await reportJson(free.id, jar);
    expect(body.report.issues).toHaveLength(3);
    expect(body.locked).toBeTruthy();
  });

  it("an expired pass falls back to the free report and the free page cap", async () => {
    h.clock.advance(7 * 24 * 3600_000 + 60_000);
    try {
      const { body } = await reportJson(free.id, buyer);
      expect(body.report.issues).toHaveLength(3);
      const r = await runScan(buyer);
      expect(r.report.limits.maxPages).toBe(25);
      expect(r.locked).toBeTruthy();
      const pdf = await h.call(pdfGET, "GET", `/api/reports/${free.id}/pdf`, { jar: buyer, params: { id: free.id } });
      expect(pdf.status).toBe(403);
    } finally {
      h.clock.advance(-(7 * 24 * 3600_000 + 60_000));
    }
  });

  it("signed-in subscribers see full anonymous reports", async () => {
    const owner = await h.signUpVerified("solo-viewer@example.com");
    await h.subscribe(owner.jar, "solo");
    const { body } = await reportJson(free.id, owner.jar);
    expect(body.locked).toBeUndefined();
    expect(body.report.issues.length).toBe(free.locked!.total);
  });

  it("pass checkout refuses unknown passes and cross-origin posts", async () => {
    const bad = await h.call(passCheckoutHandler, "POST", "/api/billing/pass/checkout", { body: { passId: "lifetime" } });
    expect(bad.status).toBe(400);
    const cross = await h.call(passCheckoutHandler, "POST", "/api/billing/pass/checkout", { body: { passId: "report" }, origin: "https://evil.example" });
    expect(cross.status).toBe(403);
  });

  it("the new paywall events are accepted with only their allow-listed props", async () => {
    const res = await h.call(eventsHandler, "POST", "/api/events", {
      body: { name: "paywall_shown", anonymousId: "a1", path: "/report/x", props: { reason: "report_issues", where: "report", hidden: 5, url: "https://broken.example.com/gone-1" } },
    });
    expect(res.status).toBe(204);
    const { rows } = await h.p.handle.executor.query<{ props: Record<string, unknown> }>(`SELECT props FROM analytics_events WHERE name = 'paywall_shown'`);
    expect(rows.at(-1)!.props).toEqual({ reason: "report_issues", where: "report", hidden: 5 });
    for (const name of ["pass_checkout_started", "pass_activated", "pass_checkout_canceled", "tool_used", "pageview"]) {
      const r = await h.call(eventsHandler, "POST", "/api/events", { body: { name, props: {} } });
      expect(r.status, name).toBe(204);
    }
    expect((await h.call(eventsHandler, "POST", "/api/events", { body: { name: "made_up" } })).status).toBe(400);
  });
});
