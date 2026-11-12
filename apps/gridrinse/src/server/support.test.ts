/**
 * Help center + support through GridRinse's real platform: real help articles from content/help, real
 * Better Auth sessions, the same handler the /api/support/[...path] route uses, mocked Anthropic client.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { makeApp, type App, type CallOpts } from "./test/harness";

let app: App | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

function citingClient() {
  const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming) => {
    const slug = /<excerpt slug="([a-z0-9-]+)"/.exec(String(body.messages[0]!.content))?.[1] ?? "none";
    return {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "text", text: JSON.stringify({ answer: "Files stay in your browser.", citations: [slug], confidence: "high", suggestTicket: false, category: "how-to" }) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 700, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as unknown as Anthropic.Message;
  });
  return { client: { messages: { create } }, create };
}

const support = (a: App, path: string, o: CallOpts = {}) =>
  a.call((p, r) => p.support.handle(r, path.split("?")[0]!.split("/")), `/api/support/${path}`, { method: o.body !== undefined || o.rawBody ? "POST" : "GET", ...o });

async function outbox(a: App, to: string, tag: string) {
  const { rows } = await a.p.handle.executor.query<{ text_body: string }>(`SELECT text_body FROM ops_email_outbox WHERE to_address = $1 AND tag = $2`, [to, tag]);
  return rows;
}

const cookies = (jar: Map<string, string>) => new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });

describe("GridRinse help center", () => {
  it("syncs the app's help articles and searches them", async () => {
    app = await makeApp();
    await app.p.support.syncArticles();
    const list = await app.p.support.listArticles();
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.length).toBeLessThanOrEqual(12);
    const res = await support(app, "search?q=file%20formats%20xlsx");
    const body = (await res.json()) as { results: { slug: string }[] };
    expect(body.results.length).toBeGreaterThan(0);
  });
});

describe("GridRinse support chat", () => {
  it("falls back to articles without an API key", async () => {
    app = await makeApp();
    const res = await support(app, "chat", { body: { message: "Are my files uploaded?" } });
    expect(((await res.json()) as { mode: string }).mode).toBe("fallback");
  });

  it("answers with citations from a mocked model, without private data in the request", async () => {
    const m = citingClient();
    app = await makeApp({ supportAiClient: m.client });
    const u = await app.user("dora@example.com", "Dora Data");
    const res = await support(app, "chat", { jar: u.jar, body: { message: "Are my files uploaded to your servers?" } });
    const body = (await res.json()) as { mode: string; citations: unknown[] };
    expect(body.mode).toBe("ai");
    expect(body.citations).toHaveLength(1);
    const payload = JSON.stringify(m.create.mock.calls[0]![0]);
    for (const secret of ["dora@example.com", "Dora Data", u.userId, u.orgId]) expect(payload).not.toContain(secret);
    expect(payload).toContain("email verified: yes");
  });

  it("rate limits per Fly-Client-IP regardless of X-Forwarded-For", async () => {
    app = await makeApp();
    for (let i = 0; i < 10; i++) {
      expect((await support(app, "chat", { body: { message: "workflow" }, ip: "203.0.113.30", headers: { "x-forwarded-for": `10.1.1.${i}` } })).status).toBe(200);
    }
    expect((await support(app, "chat", { body: { message: "workflow" }, ip: "203.0.113.30", headers: { "x-forwarded-for": "10.9.9.9" } })).status).toBe(429);
  });

  it("refuses cross-origin posts on every mutating support route", async () => {
    app = await makeApp();
    for (const path of ["chat", "tickets", "tickets/00000000-0000-4000-8000-000000000000/reply", "admin/tickets/00000000-0000-4000-8000-000000000000/status"]) {
      expect((await support(app, path, { body: { message: "x" }, origin: "https://evil.example" })).status).toBe(403);
    }
  });
});

describe("GridRinse tickets", () => {
  it("customer B gets 404 for customer A's ticket", async () => {
    app = await makeApp();
    const a = await app.user("a@example.com");
    const b = await app.user("b@example.com");
    const res = await support(app, "tickets", { jar: a.jar, body: { subject: "Dates", message: "How do I fix dates in my export?" } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await app.p.support.ticketForViewer(cookies(b.jar), id)).toBeNull();
    expect((await support(app, `tickets/${id}/resolve`, { jar: b.jar, body: {} })).status).toBe(404);
    expect((await app.p.support.ticketForViewer(cookies(a.jar), id))?.ticket.subject).toBe("Dates");
  });

  it("a security report escalates: critical incident, operator email to OWNER_ALERT_EMAIL fallback", async () => {
    app = await makeApp();
    const res = await support(app, "tickets", { body: { subject: "Security", message: "I found an XSS vulnerability in the cleaner.", email: "researcher@example.com" } });
    const body = (await res.json()) as { id: string; category: string; status: string };
    expect(body).toMatchObject({ category: "security", status: "waiting_on_operator" });
    expect((await outbox(app, "owner@gridrinse.test", "support.operator_alert")).length).toBe(1);
    const { rows } = await app.p.handle.executor.query<{ severity: string }>(`SELECT severity FROM incidents WHERE fingerprint = $1`, [`support:escalation:${body.id}`]);
    expect(rows[0]!.severity).toBe("critical");
  });

  it("operators reply from the admin route; customers cannot", async () => {
    app = await makeApp();
    const cust = await app.user("c@example.com");
    const op = await app.user("op@example.com");
    await app.p.handle.executor.query(`UPDATE auth_user SET role = 'operator' WHERE id = $1`, [op.userId]);
    const res = await support(app, "tickets", { jar: cust.jar, body: { subject: "Merge", message: "How do I merge two files with different columns?" } });
    const { id } = (await res.json()) as { id: string };
    expect((await support(app, `admin/tickets/${id}/reply`, { jar: cust.jar, body: { message: "x" } })).status).toBe(404);
    expect((await support(app, `admin/tickets/${id}/reply`, { jar: op.jar, body: { message: "Use the Merge step." } })).status).toBe(200);
    expect((await outbox(app, "c@example.com", "support.ticket_reply"))[0]!.text_body).toContain("Use the Merge step.");
  });

  it("account deletion removes the org's tickets", async () => {
    app = await makeApp();
    const u = await app.user("leaver@example.com");
    await support(app, "tickets", { jar: u.jar, body: { subject: "Question", message: "Something about trimming spaces." } });
    await app.p.support.purge([u.orgId], u.userId);
    const { rows } = await app.p.handle.executor.query(`SELECT 1 FROM support_tickets`);
    expect(rows).toHaveLength(0);
  });
});
