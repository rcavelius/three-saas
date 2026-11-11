import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DbHandle } from "@repo/database";
import { createMailer } from "./mailer";
import { createScheduler } from "./scheduler";
import { getOpenIncident } from "./incidents";
import {
  alertEmail,
  escapeHtml,
  paymentFailedEmail,
  planChangedEmail,
  renderBrandedEmail,
  subscriptionCanceledEmail,
  usageNearLimitEmail,
  welcomeEmail,
} from "./email";
import type { EmailMessage, FetchLike } from "./types";
import { brand, logSink, makeClock, makeDb } from "./test/fixtures";

let handle: DbHandle<any>;
beforeAll(async () => {
  handle = await makeDb({ withAuthBilling: false });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.executor.exec(`DELETE FROM jobs; DELETE FROM incidents; DELETE FROM ops_email_outbox;`);
});

const msg: EmailMessage = {
  to: "jane.doe@example.com",
  subject: "Hello",
  text: "secret body text",
  html: "<p>secret body html</p>",
  tag: "welcome",
};

function setup(responses: (() => Response | Promise<Response>)[], opts: { key?: string; maxAttempts?: number } = {}) {
  const clock = makeClock("2026-04-01T12:00:00Z");
  const { lines, logger } = logSink();
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fetchMock: FetchLike = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init! });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return r();
  });
  const mailer = createMailer({
    handle,
    from: "TestBrand <hello@testbrand.example>",
    resendApiKey: "key" in opts ? opts.key : "re_test_key_123",
    brand,
    fetch: fetchMock,
    now: clock,
    logger,
    maxAttempts: opts.maxAttempts ?? 3,
  });
  const scheduler = createScheduler({ handle, jobs: { [mailer.queue]: mailer.jobHandler }, schedules: [], now: clock, logger });
  return { clock, lines, calls, mailer, scheduler, fetchMock };
}

const outbox = async (id: string) =>
  (
    await handle.executor.query<{ status: string; attempts: number; provider_id: string | null; error: string | null; sent_at: Date | null }>(
      `SELECT status, attempts, provider_id, error, sent_at FROM ops_email_outbox WHERE id = $1`,
      [id],
    )
  ).rows[0]!;

const ok = () => new Response(JSON.stringify({ id: "re_msg_1" }), { status: 200 });
const status = (s: number, name = "error") => () => new Response(JSON.stringify({ name, message: "for jane.doe@example.com" }), { status: s });

describe("mailer", () => {
  it("writes to the outbox, enqueues a job and delivers through Resend with the outbox id as Idempotency-Key", async () => {
    const t = setup([ok]);
    const { id } = await t.mailer.send(msg);
    expect((await outbox(id)).status).toBe("queued");
    const r = await t.scheduler.tick();
    expect(r.succeeded).toBe(1);
    expect(t.calls).toHaveLength(1);
    const { url, init } = t.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(id);
    expect(headers.Authorization).toBe("Bearer re_test_key_123");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ to: ["jane.doe@example.com"], subject: "Hello", from: "TestBrand <hello@testbrand.example>" });
    const row = await outbox(id);
    expect(row).toMatchObject({ status: "sent", attempts: 1, provider_id: "re_msg_1" });
    expect(row.sent_at).not.toBeNull();
    // Never logs bodies or full addresses.
    const log = t.lines.join("\n");
    expect(log).not.toContain("jane.doe@example.com");
    expect(log).not.toContain("secret body");
    expect(log).toContain("j***@example.com");
  });

  it("retries 429 and 500 with backoff, then succeeds", async () => {
    const t = setup([status(429, "rate_limit_exceeded"), status(500), ok]);
    const { id } = await t.mailer.send(msg);
    expect((await t.scheduler.tick()).retried).toBe(1);
    expect((await outbox(id)).status).toBe("retrying");
    t.clock.advance(30_000);
    expect((await t.scheduler.tick()).retried).toBe(1);
    t.clock.advance(59_000);
    expect((await t.scheduler.tick()).ran).toBe(0); // second backoff is 60 s
    t.clock.advance(1_000);
    expect((await t.scheduler.tick()).succeeded).toBe(1);
    expect(await outbox(id)).toMatchObject({ status: "sent", attempts: 3 });
    // Same idempotency key on every attempt.
    expect(t.calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"])).toEqual([id, id, id]);
    expect(t.lines.join("\n")).not.toContain("jane.doe@example.com");
  });

  it("retries network errors", async () => {
    const t = setup([
      () => {
        throw new TypeError("fetch failed");
      },
      ok,
    ]);
    const { id } = await t.mailer.send(msg);
    expect((await t.scheduler.tick()).retried).toBe(1);
    t.clock.advance(30_000);
    await t.scheduler.tick();
    expect((await outbox(id)).status).toBe("sent");
  });

  it("treats other 4xx as permanent: dead letter + incident, no retry", async () => {
    const t = setup([status(422, "validation_error"), ok]);
    const { id } = await t.mailer.send(msg);
    const r = await t.scheduler.tick();
    expect(r.deadLettered).toHaveLength(1);
    expect(t.calls).toHaveLength(1);
    const row = await outbox(id);
    expect(row.status).toBe("failed");
    expect(row.error).toBe("resend 422 validation_error");
    expect(row.error).not.toContain("jane");
    expect((await getOpenIncident(handle.executor, "job:email.send"))?.severity).toBe("warning");
  });

  it("dead-letters after max attempts of 5xx", async () => {
    const t = setup([status(503)], { maxAttempts: 2 });
    const { id } = await t.mailer.send(msg);
    await t.scheduler.tick();
    t.clock.advance(30_000);
    const r = await t.scheduler.tick();
    expect(r.deadLettered).toHaveLength(1);
    expect(await outbox(id)).toMatchObject({ status: "failed", attempts: 2 });
    expect(await getOpenIncident(handle.executor, "job:email.send")).not.toBeNull();
  });

  it("without an API key marks messages as logged and never calls the network", async () => {
    const t = setup([ok], { key: undefined });
    const { id } = await t.mailer.send(msg);
    await t.scheduler.tick();
    expect(t.fetchMock).not.toHaveBeenCalled();
    expect((await outbox(id)).status).toBe("logged");
    expect(t.lines.join("\n")).not.toContain("jane.doe@example.com");
  });

  it("does not re-send an already delivered message", async () => {
    const t = setup([ok]);
    const { id } = await t.mailer.send(msg);
    await t.scheduler.tick();
    await t.mailer.jobHandler({ outboxId: id }, {
      jobId: "x",
      queue: "email.send",
      attempt: 1,
      maxAttempts: 3,
      isFinalAttempt: false,
      now: t.clock(),
      logger: logSink().logger,
    });
    expect(t.calls).toHaveLength(1);
  });

  it("rejects invalid recipients and strips header-breaking characters from subjects", async () => {
    const t = setup([ok]);
    await expect(t.mailer.send({ ...msg, to: "not an email" })).rejects.toThrow(/recipient/);
    await expect(t.mailer.send({ ...msg, to: "a@b.c, evil@x.y" })).rejects.toThrow(/recipient/);
    const { id } = await t.mailer.send({ ...msg, subject: "Hi\r\nBcc: evil@x.y" });
    const { rows } = await handle.executor.query<{ subject: string }>(`SELECT subject FROM ops_email_outbox WHERE id = $1`, [id]);
    expect(rows[0]!.subject).toBe("Hi Bcc: evil@x.y");
  });
});

describe("renderBrandedEmail", () => {
  it("escapes every interpolated value", () => {
    const { html, text } = renderBrandedEmail(
      { ...brand, name: `<img src=x onerror=alert(1)>`, primaryColor: `red;background:url(javascript:alert(1))` },
      {
        heading: `<script>alert("h")</script>`,
        paragraphs: [`Tom & "Jerry" <b>bold</b> 'quote'`],
        action: { label: `<i>Go</i>`, url: `https://example.com/a?x="><script>` },
        footer: "<footer>",
      },
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;alert(&quot;h&quot;)&lt;/script&gt;");
    expect(html).toContain("Tom &amp; &quot;Jerry&quot; &lt;b&gt;bold&lt;/b&gt; &#39;quote&#39;");
    expect(html).toContain("#2563eb"); // invalid colour replaced
    expect(text).toContain(`<script>alert("h")</script>`); // plain text is not HTML
    expect(text).toContain("https://example.com/a?x=%22%3E%3Cscript%3E");
  });

  it("drops non-http(s) action links", () => {
    const { html, text } = renderBrandedEmail(brand, {
      heading: "h",
      paragraphs: ["p"],
      action: { label: "Click", url: "javascript:alert(1)" },
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Click");
    expect(text).not.toContain("javascript:");
  });

  it("uses inline styles and the brand colour", () => {
    const { html } = renderBrandedEmail(brand, { heading: "Hi", paragraphs: ["p"], action: { label: "Go", url: "https://x.example" } });
    expect(html).not.toMatch(/<style/);
    expect(html).toContain("#0f766e");
    expect(html).toContain('href="https://x.example/"');
  });

  it("escapeHtml covers the five significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

describe("routine email builders", () => {
  it("build branded messages with the right tags and links", () => {
    const w = welcomeEmail(brand, { to: "a@b.example", name: "Ann", dashboardUrl: "https://testbrand.example/app" });
    expect(w).toMatchObject({ to: "a@b.example", tag: "welcome", subject: "Welcome to TestBrand" });
    expect(w.html).toContain("https://testbrand.example/app");

    const pf = paymentFailedEmail(brand, {
      to: "a@b.example",
      amountDueCents: 1200,
      portalUrl: "https://billing.stripe.com/p/session/123",
      nextAttemptAt: new Date("2026-04-05T00:00:00Z"),
    });
    expect(pf.tag).toBe("payment_failed");
    expect(pf.text).toContain("$12.00");
    expect(pf.text).toContain("April 5, 2026");
    expect(pf.html).toContain("https://billing.stripe.com/p/session/123");

    const sc = subscriptionCanceledEmail(brand, { to: "a@b.example", planName: "Solo", billingUrl: "https://testbrand.example/billing" });
    expect(sc.tag).toBe("subscription_canceled");
    expect(sc.text).toContain("free plan");

    const pc = planChangedEmail(brand, { to: "a@b.example", fromPlan: "Solo", toPlan: "Team", billingUrl: "https://testbrand.example/billing" });
    expect(pc.subject).toBe("Your TestBrand plan changed to Team");

    const u = usageNearLimitEmail(brand, { to: "a@b.example", metricLabel: "scans", used: 80, limit: 100, upgradeUrl: "https://testbrand.example/pricing" });
    expect(u.subject).toBe("You have used 80% of your scans on TestBrand");

    const al = alertEmail(brand, { to: "o@b.example", title: "DB <down>", severity: "critical", summary: "s", facts: { n: 3 } });
    expect(al.tag).toBe("alert_critical");
    expect(al.subject).toBe("[TestBrand] CRITICAL: DB <down>");
    expect(al.html).toContain("DB &lt;down&gt;");
  });
});
