import { afterEach, describe, expect, it } from "vitest";
import { createScheduler } from "@repo/ops";
import { categorize, categorizeByRules } from "./categorize";
import { mockClient, modelMessage, setup, type Ctx } from "./test/helpers";

let ctx: Ctx | null = null;
afterEach(async () => {
  await ctx?.close();
  ctx = null;
});

async function create(c: Ctx, body: Record<string, string>, user?: string) {
  const res = await c.call("tickets", { body, user });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

function tokenFrom(url: string): string {
  return new URL(url, "https://x.test").searchParams.get("t")!;
}

describe("categorization rules", () => {
  it.each([
    ["I found an XSS vulnerability in your login page", "security"],
    ["My lawyer will send a cease and desist", "legal"],
    ["I want a refund for last month", "refund-dispute"],
    ["My bank shows a chargeback", "refund-dispute"],
    ["GDPR data access request: send me a copy of my data", "privacy"],
    ["This user is spamming phone numbers, please report this user", "abuse"],
    ["How do I download an invoice?", "billing"],
    ["I cannot log in after a password change", "account"],
    ["The page shows an error 500", "bug"],
    ["Feature request: dark mode would be nice", "feature-request"],
    ["How do I export my report as PDF?", null],
  ])("%s -> %s", (text, cat) => {
    expect(categorizeByRules(text)).toBe(cat);
  });

  it("an AI suggestion is used when no rule matches, and escalation from either source wins", () => {
    expect(categorize("How do I export my report?", "how-to")).toBe("how-to");
    expect(categorize("How do I export my report?", "bug")).toBe("bug");
    expect(categorize("How do I export my report?", "not-a-category")).toBe("how-to");
    expect(categorize("I want a refund", "how-to")).toBe("refund-dispute");
    expect(categorize("Question about my plan", "security")).toBe("security");
  });
});

describe("creating tickets", () => {
  it("anonymous ticket: needs an email, gets a private token link by email", async () => {
    ctx = await setup({ ai: {} });
    expect((await create(ctx, { subject: "Help please", message: "How does the export work exactly?" })).status).toBe(400);
    const r = await create(ctx, { subject: "Export question", message: "How do I export my report as a PDF file?", email: "zed@z.example" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: "open", escalated: false, category: "how-to" });
    const mail = (await ctx.outbox()).find((m) => m.tag === "support.ticket_received")!;
    expect(mail.to_address).toBe("zed@z.example");
    const link = /https:\/\/\S+\?t=\S+/.exec(mail.text_body)![0];
    const token = tokenFrom(link);
    const { rows } = await ctx.handle.executor.query<{ access_token_hash: string }>(`SELECT access_token_hash FROM support_tickets`);
    expect(rows[0]!.access_token_hash).not.toContain(token); // only the hash is stored
    const view = await ctx.support.ticketForViewer(new Headers(), r.body.id, token);
    expect(view?.ticket.subject).toBe("Export question");
    expect(view?.messages[0]).toMatchObject({ author: "customer" });
    expect(await ctx.support.ticketForViewer(new Headers(), r.body.id, token.slice(0, -2) + "xx")).toBeNull();
    expect(await ctx.support.ticketForViewer(new Headers(), r.body.id, null)).toBeNull();
  });

  it("signed-in ticket: org and user come from the session, never from the body", async () => {
    ctx = await setup({ ai: {} });
    const r = await create(ctx, { subject: "Plan question", message: "Which plan includes more seats?", email: "spoof@evil.example", org_id: "org-b" } as Record<string, string>, "amy");
    expect(r.status).toBe(201);
    const { rows } = await ctx.handle.executor.query<{ org_id: string; user_id: string; email: string }>(`SELECT org_id, user_id, email FROM support_tickets`);
    expect(rows[0]).toEqual({ org_id: "org-a", user_id: "u-amy", email: "amy@a.example" });
  });

  it("works as a plain HTML form (no JS): 303 to the ticket page", async () => {
    ctx = await setup({ ai: {} });
    // Pages with Referrer-Policy: no-referrer make browsers send Origin: null with Sec-Fetch-Site: same-origin.
    const nullOrigin = await ctx.call("tickets", { form: { subject: "Null origin", message: "Posted from a no-referrer page.", email: "n@n.example" }, origin: "null", headers: { "sec-fetch-site": "same-origin" } });
    expect(nullOrigin.status).toBe(303);
    const res = await ctx.call("tickets", { form: { subject: "Form ticket", message: "Submitted without JavaScript.", email: "f@f.example" } });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/support\/tickets\/[0-9a-f-]{36}\?t=.+&created=1$/);
    const bad = await ctx.call("tickets", { form: { subject: "x", message: "short", email: "f@f.example" } });
    expect(bad.status).toBe(303);
    expect(bad.headers.get("location")).toContain("error=subject_required");
  });

  it("a filled honeypot looks like success but creates nothing", async () => {
    ctx = await setup({ ai: {} });
    const r = await create(ctx, { subject: "Buy now", message: "Cheap things for sale here", email: "bot@b.example", website: "http://spam" });
    expect(r.status).toBe(200);
    const { rows } = await ctx.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM support_tickets`);
    expect(rows[0]!.n).toBe(0);
  });

  it("is rate limited per client IP", async () => {
    ctx = await setup({ ai: {} });
    for (let i = 0; i < 5; i++) expect((await create(ctx, { subject: `Q ${i}`, message: "A question about exports.", email: "r@r.example" })).status).toBe(201);
    expect((await create(ctx, { subject: "Q 6", message: "A question about exports.", email: "r@r.example" })).status).toBe(429);
  });
});

describe("escalation", () => {
  it.each([
    ["security", "Security issue: I found an XSS vulnerability", "critical"],
    ["legal", "Legal notice: DMCA copyright infringement", "warning"],
    ["refund-dispute", "I want a refund, I was charged twice", "warning"],
    ["refund-dispute", "My bank opened a chargeback dispute", "warning"],
    ["privacy", "GDPR subject access request for my personal data", "warning"],
  ])("%s ticket -> high priority, waiting_on_operator, incident and operator email", async (category, text, severity) => {
    ctx = await setup({ ai: {} });
    const r = await create(ctx, { subject: text.slice(0, 40), message: text, email: "c@c.example" });
    expect(r.body).toMatchObject({ category, escalated: true, status: "waiting_on_operator" });
    const { rows } = await ctx.handle.executor.query<{ priority: string; escalation_reason: string }>(`SELECT priority, escalation_reason FROM support_tickets`);
    expect(rows[0]!.priority).toBe("high");
    expect(rows[0]!.escalation_reason).toBeTruthy();
    const inc = (await ctx.incidents()).find((i) => i.fingerprint === `support:escalation:${r.body.id}`);
    expect(inc?.severity).toBe(severity);
    const mails = await ctx.outbox();
    expect(mails.find((m) => m.to_address === "ops@example.test" && m.tag === "support.operator_alert")).toBeTruthy();
    const customer = mails.find((m) => m.to_address === "c@c.example")!;
    expect(customer.tag).toBe("support.ticket_escalated");
    expect(customer.text_body).toMatch(/a person on our team/);
    expect(customer.text_body).not.toMatch(/will (be )?refund|guarantee|within \d+ (hours|days)/i);
    // Escalated tickets never get an automated answer.
    const { rows: jobs } = await ctx.handle.executor.query(`SELECT 1 FROM jobs WHERE queue = 'support.first_answer'`);
    expect(jobs).toHaveLength(0);
  });
});

describe("customer access is scoped", () => {
  async function seed(c: Ctx) {
    const a = await create(c, { subject: "Amy's ticket", message: "Question from Amy about billing pages." }, "amy");
    const anon = await create(c, { subject: "Anon ticket", message: "Question about the export button.", email: "anon@x.example" });
    return { amyTicket: a.body.id as string, anonTicket: anon.body.id as string };
  }

  it("user B gets 404 for user A's ticket on read, reply and resolve", async () => {
    ctx = await setup({ ai: {} });
    const { amyTicket } = await seed(ctx);
    const bob = new Headers({ "x-test-user": "bob" });
    expect(await ctx.support.ticketForViewer(bob, amyTicket)).toBeNull();
    expect((await ctx.call(`tickets/${amyTicket}/reply`, { body: { message: "hijack" }, user: "bob" })).status).toBe(404);
    expect((await ctx.call(`tickets/${amyTicket}/resolve`, { body: {}, user: "bob" })).status).toBe(404);
    expect((await ctx.support.ticketsForViewer(bob)).tickets).toEqual([]);
    const { rows } = await ctx.handle.executor.query(`SELECT 1 FROM support_messages WHERE body = 'hijack'`);
    expect(rows).toHaveLength(0);
  });

  it("members see only their own tickets; owners see the org's", async () => {
    ctx = await setup({ ai: {} });
    const { amyTicket } = await seed(ctx);
    const andy = new Headers({ "x-test-user": "andy" });
    expect(await ctx.support.ticketForViewer(andy, amyTicket)).toBeNull();
    expect((await ctx.support.ticketsForViewer(andy)).tickets).toEqual([]);
    const alice = new Headers({ "x-test-user": "alice" });
    expect((await ctx.support.ticketForViewer(alice, amyTicket))?.ticket.id).toBe(amyTicket);
    expect((await ctx.support.ticketsForViewer(alice)).tickets.map((t) => t.id)).toEqual([amyTicket]);
  });

  it("an anonymous ticket is reachable only with its token; a signed-in user cannot list it", async () => {
    ctx = await setup({ ai: {} });
    const { anonTicket } = await seed(ctx);
    expect(await ctx.support.ticketForViewer(new Headers({ "x-test-user": "alice" }), anonTicket)).toBeNull();
    expect((await ctx.call(`tickets/${anonTicket}/reply`, { body: { message: "no token" } })).status).toBe(404);
    expect((await ctx.call(`tickets/not-a-uuid/reply`, { body: { message: "x" } })).status).toBe(404);
  });

  it("the customer can reply and mark resolved with the token; a closed ticket refuses replies", async () => {
    ctx = await setup({ ai: {} });
    const anon = await create(ctx, { subject: "Anon ticket", message: "Question about the export button.", email: "anon@x.example" });
    const token = tokenFrom(anon.body.url);
    const reply = await ctx.call(`tickets/${anon.body.id}/reply`, { form: { message: "More details here", t: token } });
    expect(reply.status).toBe(303);
    expect(reply.headers.get("location")).toContain("updated=1");
    let view = await ctx.support.ticketForViewer(new Headers(), anon.body.id, token);
    expect(view?.ticket.status).toBe("waiting_on_operator");
    expect((await ctx.call(`tickets/${anon.body.id}/resolve`, { body: { t: token } })).status).toBe(200);
    view = await ctx.support.ticketForViewer(new Headers(), anon.body.id, token);
    expect(view?.ticket.status).toBe("resolved");
    await ctx.support.operatorSetStatus(anon.body.id, "closed");
    expect((await ctx.call(`tickets/${anon.body.id}/reply`, { body: { message: "again", t: token } })).status).toBe(409);
  });
});

describe("operator side", () => {
  it("only operators may act; a reply emails the customer and waits on them", async () => {
    ctx = await setup({ ai: {} });
    const t = await create(ctx, { subject: "Export question", message: "How do I export my report?", email: "q@q.example" });
    expect((await ctx.call(`admin/tickets/${t.body.id}/reply`, { body: { message: "Hi" }, user: "alice" })).status).toBe(404);
    expect((await ctx.call(`admin/tickets/${t.body.id}/reply`, { body: { message: "Hi" } })).status).toBe(404);
    const res = await ctx.call(`admin/tickets/${t.body.id}/reply`, { form: { message: "Use the Export button on the report page." }, user: "olga" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/admin/support/${t.body.id}?msg=saved`);
    const mail = (await ctx.outbox()).find((m) => m.tag === "support.ticket_reply")!;
    expect(mail.to_address).toBe("q@q.example");
    expect(mail.text_body).toContain("Use the Export button on the report page.");
    expect(mail.text_body).toMatch(/\?t=/); // anonymous customers get their private link again
    const ticket = (await ctx.support.adminTicket(t.body.id))!;
    expect(ticket.ticket.status).toBe("waiting_on_customer");
    expect(ticket.messages.map((m) => m.author)).toEqual(["customer", "operator"]);

    expect((await ctx.call(`admin/tickets/${t.body.id}/status`, { body: { status: "resolved" }, user: "olga" })).status).toBe(200);
    expect((await ctx.outbox()).some((m) => m.tag === "support.ticket_status" && m.to_address === "q@q.example")).toBe(true);
    expect((await ctx.call(`admin/tickets/${t.body.id}/status`, { body: { status: "deleted" }, user: "olga" })).status).toBe(400);
  });

  it("the queue lists escalated tickets first and filters by status/priority/category", async () => {
    ctx = await setup({ ai: {} });
    await create(ctx, { subject: "Plain question", message: "How do I export a report?", email: "a@a.example" });
    await create(ctx, { subject: "Refund please", message: "I want a refund for this month.", email: "b@b.example" });
    const q = await ctx.support.adminQueue();
    expect(q[0]!.category).toBe("refund-dispute");
    expect(await ctx.support.adminQueue({ category: "how-to" })).toHaveLength(1);
    expect(await ctx.support.adminQueue({ priority: "high" })).toHaveLength(1);
    expect(await ctx.support.adminQueue({ status: "closed" })).toHaveLength(0);
    expect(await ctx.support.adminCounts()).toMatchObject({ open: 2, escalated: 1 });
  });
});

describe("CSRF / same-origin on every mutating route", () => {
  it.each(["chat", "tickets", "tickets/00000000-0000-4000-8000-000000000000/reply", "tickets/00000000-0000-4000-8000-000000000000/resolve", "admin/tickets/00000000-0000-4000-8000-000000000000/reply", "admin/tickets/00000000-0000-4000-8000-000000000000/status"])(
    "POST %s from another origin -> 403",
    async (path) => {
      ctx = ctx ?? (await setup({ ai: {} }));
      expect((await ctx.call(path, { body: { message: "x" }, origin: "https://evil.example", user: "olga" })).status).toBe(403);
      expect((await ctx.call(path, { body: { message: "x" }, origin: null, headers: { "sec-fetch-site": "cross-site" }, user: "olga" })).status).toBe(403);
      // Origin "null" (opaque origin, e.g. a sandboxed cross-site frame) is only trusted with Sec-Fetch-Site: same-origin.
      expect((await ctx.call(path, { body: { message: "x" }, origin: "null", user: "olga" })).status).toBe(403);
      expect((await ctx.call(path, { body: { message: "x" }, origin: "null", headers: { "sec-fetch-site": "cross-site" }, user: "olga" })).status).toBe(403);
    },
  );
});

describe("scheduled jobs", () => {
  it("drafts an automated first answer for a how-to ticket (search fallback without AI)", async () => {
    ctx = await setup({ ai: {} });
    const t = await create(ctx, { subject: "Reset password", message: "How do I reset my password? I forgot it.", email: "p@p.example" });
    const scheduler = createScheduler({ handle: ctx.handle, jobs: { ...ctx.support.jobs, [ctx.mailer.queue]: ctx.mailer.jobHandler }, schedules: [], now: ctx.clock });
    const report = await scheduler.tick({ budgetMs: 10_000 });
    expect(report.errors).toEqual([]);
    expect(report.deadLettered).toEqual([]);
    const view = (await ctx.support.adminTicket(t.body.id))!;
    expect(view.ticket.status).toBe("waiting_on_customer");
    const auto = view.messages.find((m) => m.author === "assistant")!;
    expect(auto.automated).toBe(true);
    expect(auto.body).toMatch(/^Automated answer/);
    expect(auto.body).toContain("/help/reset-password");
    expect((await ctx.outbox()).some((m) => m.tag === "support.ticket_auto_answer")).toBe(true);
  });

  it("uses a grounded AI answer for the first reply when available", async () => {
    const m = mockClient(() => modelMessage({ answer: "Go to /forgot-password and enter your email.", citations: ["reset-password"], confidence: "high", suggestTicket: false, category: "account" }));
    ctx = await setup({ ai: { client: m.client } });
    const t = await create(ctx, { subject: "Where is the reset page", message: "How do I reset my password? I forgot it.", email: "p@p.example" });
    expect(await ctx.support.firstAnswer(t.body.id)).toBe("answered");
    const auto = (await ctx.support.adminTicket(t.body.id))!.messages.find((x) => x.author === "assistant")!;
    expect(auto.body).toContain("Go to /forgot-password");
    expect(auto.body).toContain("Sources:");
    expect(await ctx.support.firstAnswer(t.body.id)).toBe("skipped"); // idempotent
  });

  it("auto-closes tickets after 7 days without a customer reply and emails a notice", async () => {
    ctx = await setup({ ai: {} });
    const t = await create(ctx, { subject: "Export question", message: "How do I export my report?", email: "q@q.example" });
    await ctx.support.operatorReply({ id: "u-olga", email: "olga@ops.example" }, t.body.id, "Use the export button.");
    ctx.clock.advance(6 * 86_400_000);
    expect(await ctx.support.autoClose()).toBe(0);
    ctx.clock.advance(2 * 86_400_000);
    const scheduler = createScheduler({
      handle: ctx.handle,
      jobs: ctx.support.jobs,
      schedules: ctx.support.schedules.filter((s) => s.name === "support.auto_close"),
      now: ctx.clock,
    });
    const report = await scheduler.tick({ budgetMs: 10_000, maxJobs: 50 });
    expect(report.enqueued.map((e) => e.queue)).toEqual(["support.auto_close"]);
    expect((await ctx.support.adminTicket(t.body.id))!.ticket.status).toBe("closed");
    expect((await ctx.outbox()).some((m) => m.tag === "support.ticket_auto_closed" && m.to_address === "q@q.example")).toBe(true);
  });

  it("does not auto-close when the customer replied after the operator", async () => {
    ctx = await setup({ ai: {} });
    const t = await create(ctx, { subject: "Export question", message: "How do I export my report?", email: "q@q.example" });
    await ctx.support.operatorReply({ id: "u-olga", email: "olga@ops.example" }, t.body.id, "Use the export button.");
    ctx.clock.advance(86_400_000);
    await ctx.call(`tickets/${t.body.id}/reply`, { body: { message: "Thanks, still stuck", t: tokenFrom(t.body.url) } });
    ctx.clock.advance(10 * 86_400_000);
    expect(await ctx.support.autoClose()).toBe(0);
  });
});

describe("account deletion", () => {
  it("purges tickets of deleted orgs and of the user", async () => {
    ctx = await setup({ ai: {} });
    await create(ctx, { subject: "Amy's ticket", message: "Question from Amy about billing pages." }, "amy");
    await create(ctx, { subject: "Bob's ticket", message: "Question from Bob about billing pages." }, "bob");
    expect(await ctx.support.purge(["org-a"])).toBe(1);
    const { rows } = await ctx.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM support_messages`);
    expect(rows[0]!.n).toBe(1);
  });
});
