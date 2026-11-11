/**
 * Help center + support through SiteProof's real platform and route handler: real help articles from
 * content/help, real auth sessions, mocked Anthropic client (no network, no key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { GET, POST } from "@/app/api/support/[...path]/route";
import { createHarness, type CallOpts, type Harness } from "./harness";

let h: Harness | null = null;
afterEach(async () => {
  await h?.close();
  h = null;
});

/** A model stand-in that cites the first excerpt it was given. */
function citingClient() {
  const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming) => {
    const content = String(body.messages[0]!.content);
    const slug = /<excerpt slug="([a-z0-9-]+)"/.exec(content)?.[1] ?? "none";
    return {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "text", text: JSON.stringify({ answer: "See the billing page.", citations: [slug], confidence: "high", suggestTicket: false, category: "billing" }) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 800, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as unknown as Anthropic.Message;
  });
  return { client: { messages: { create } }, create };
}

function api(harness: Harness, method: "GET" | "POST", path: string, o: CallOpts = {}) {
  const handler = (req: Request) => (method === "GET" ? GET : POST)(req, { params: Promise.resolve({ path: path.split("?")[0]!.split("/") }) });
  return harness.call(handler, method, `/api/support/${path}`, o);
}

describe("SiteProof help center", () => {
  it("loads and validates the app's own help articles, searchable by full text", async () => {
    h = await createHarness();
    const report = await h.p.support.syncArticles();
    const list = await h.p.support.listArticles();
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.length).toBeLessThanOrEqual(12);
    expect(report).not.toBeNull();
    const res = await api(h, "GET", "search?q=cancel%20subscription");
    const body = (await res.json()) as { results: { slug: string; url: string }[] };
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]!.url).toMatch(/^\/help\/[a-z0-9-]+$/);
  });

  it("registers the support jobs with the scheduler", async () => {
    h = await createHarness();
    await h.p.scheduler.tick({ budgetMs: 5_000, maxJobs: 0 });
    const { rows } = await h.p.handle.executor.query<{ name: string }>(`SELECT name FROM ops_schedules WHERE name LIKE 'support.%' ORDER BY name`);
    expect(rows.map((r) => r.name)).toEqual(["support.auto_close", "support.sync_articles"]);
  });
});

describe("SiteProof support chat", () => {
  it("without ANTHROPIC_API_KEY the chat falls back to help articles", async () => {
    h = await createHarness();
    const res = await api(h, "POST", "chat", { body: { message: "How do I cancel my plan?" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mode: string; articles: unknown[]; suggestTicket: boolean };
    expect(body).toMatchObject({ mode: "fallback", suggestTicket: true });
    expect(body.articles.length).toBeGreaterThan(0);
  });

  it("with a (mocked) model returns a cited answer and sends no private account data", async () => {
    const m = citingClient();
    h = await createHarness({}, { supportAiClient: m.client });
    const user = await h.signUpVerified("cara@example.com", "Cara Customer");
    const res = await api(h, "POST", "chat", { jar: user.jar, body: { message: "How do I cancel my subscription?" } });
    const body = (await res.json()) as { mode: string; citations: { slug: string }[] };
    expect(body.mode).toBe("ai");
    expect(body.citations).toHaveLength(1);
    const payload = JSON.stringify(m.create.mock.calls[0]![0]);
    expect(payload).toContain("plan: Free");
    for (const secret of ["cara@example.com", "Cara Customer", user.userId, user.orgId]) expect(payload).not.toContain(secret);
  });

  it("rate limits by the trusted proxy hop; spoofed left-most X-Forwarded-For entries do not help", async () => {
    h = await createHarness();
    for (let i = 0; i < 10; i++) {
      expect((await api(h, "POST", "chat", { body: { message: "password" }, ip: `10.0.0.${i}, 203.0.113.9` })).status).toBe(200);
    }
    expect((await api(h, "POST", "chat", { body: { message: "password" }, ip: "10.9.9.9, 203.0.113.9" })).status).toBe(429);
  });

  it("refuses cross-origin posts", async () => {
    h = await createHarness();
    expect((await api(h, "POST", "chat", { body: { message: "hi" }, origin: "https://evil.example" })).status).toBe(403);
    expect((await api(h, "POST", "tickets", { body: { subject: "x", message: "y" }, origin: "https://evil.example" })).status).toBe(403);
  });
});

describe("SiteProof tickets", () => {
  it("signed-in tickets are org-scoped: another customer gets 404", async () => {
    h = await createHarness();
    const a = await h.signUpVerified("owner-a@example.com");
    const b = await h.signUpVerified("owner-b@example.com");
    const res = await api(h, "POST", "tickets", { jar: a.jar, body: { subject: "Export question", message: "How do I export my report as a PDF?" } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const headersFor = (jar: Map<string, string>) => new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });
    expect((await h.p.support.ticketForViewer(headersFor(a.jar), id))?.ticket.id).toBe(id);
    expect(await h.p.support.ticketForViewer(headersFor(b.jar), id)).toBeNull();
    expect((await api(h, "POST", `tickets/${id}/reply`, { jar: b.jar, body: { message: "not mine" } })).status).toBe(404);
    expect((await h.p.support.ticketsForViewer(headersFor(b.jar))).tickets).toEqual([]);
    expect((await h.outbox("owner-a@example.com", "support.ticket_received")).length).toBe(1);
  });

  it("an anonymous refund request is escalated: operator email, incident, honest auto-reply", async () => {
    h = await createHarness({ SUPPORT_OPERATOR_EMAIL: "support-team@siteproof.test" });
    const res = await api(h, "POST", "tickets", {
      form: { subject: "Refund", message: "I was charged twice and want a refund.", email: "anon@example.com" },
    });
    expect(res.status).toBe(303);
    const loc = res.headers.get("location")!;
    expect(loc).toMatch(/^\/support\/tickets\/[0-9a-f-]{36}\?t=/);
    const id = loc.split("/")[3]!.split("?")[0]!;
    const token = new URL(loc, "http://x").searchParams.get("t");
    const view = await h.p.support.ticketForViewer(new Headers(), id, token);
    expect(view?.ticket).toMatchObject({ category: "refund-dispute", priority: "high", status: "waiting_on_operator", escalated: true });
    expect((await h.outbox("support-team@siteproof.test", "support.operator_alert")).length).toBe(1);
    expect((await h.outbox("anon@example.com", "support.ticket_escalated"))[0]!.text_body).toMatch(/a person on our team/);
    const { rows } = await h.p.handle.executor.query(`SELECT 1 FROM incidents WHERE fingerprint = $1`, [`support:escalation:${id}`]);
    expect(rows).toHaveLength(1);
  });

  it("operator actions are 404 for customers and email the customer for operators", async () => {
    h = await createHarness();
    const cust = await h.signUpVerified("cust@example.com");
    const op = await h.signUpVerified("op@example.com");
    await h.p.handle.executor.query(`UPDATE auth_user SET role = 'operator' WHERE id = $1`, [op.userId]);
    const created = await api(h, "POST", "tickets", { jar: cust.jar, body: { subject: "Scan question", message: "Why was my scan blocked by robots.txt?" } });
    const { id } = (await created.json()) as { id: string };
    expect((await api(h, "POST", `admin/tickets/${id}/reply`, { jar: cust.jar, form: { message: "x" } })).status).toBe(404);
    const r = await api(h, "POST", `admin/tickets/${id}/reply`, { jar: op.jar, form: { message: "Your robots.txt disallows our bot." } });
    expect(r.status).toBe(303);
    const mails = await h.outbox("cust@example.com", "support.ticket_reply");
    expect(mails[0]!.text_body).toContain("Your robots.txt disallows our bot.");
  });
});
