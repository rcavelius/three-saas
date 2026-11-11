/**
 * Help center + support through HookPilot's real platform and /api/support/[...path] route: real help
 * articles from content/help, Better Auth sessions, mocked Anthropic client (no network, no key).
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import * as supportRoute from "@/app/api/support/[...path]/route";
import { resetPlatformForTests, type Platform } from "@/lib/platform";
import { apiRequest, signUpVerified, uniqueEmail, type Jar } from "./helpers";
import { setupPlatform } from "./platform";

const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming) => {
  const slug = /<excerpt slug="([a-z0-9-]+)"/.exec(String(body.messages[0]!.content))?.[1] ?? "none";
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: body.model,
    content: [{ type: "text", text: JSON.stringify({ answer: "Replay sends a stored request again.", citations: [slug], confidence: "high", suggestTicket: false, category: "how-to" }) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 700, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Message;
});

let p: Platform;
const ready = setupPlatform({ supportAiClient: { messages: { create } }, supportOperatorEmail: "ops@hookpilot.test" }).then((r) => (p = r.p));
afterAll(async () => resetPlatformForTests());

function call(method: "GET" | "POST", path: string, o: { jar?: Jar; body?: unknown; ip?: string; origin?: string | null; headers?: Record<string, string> } = {}) {
  const handler = method === "GET" ? supportRoute.GET : supportRoute.POST;
  return handler(apiRequest(method, `/api/support/${path}`, o), { params: Promise.resolve({ path: path.split("?")[0]!.split("/") }) });
}

const cookies = (jar: Jar) => new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });

describe("HookPilot help center", () => {
  it("syncs the app's own help articles and serves search", async () => {
    await ready;
    await p.support.syncArticles();
    const list = await p.support.listArticles();
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.length).toBeLessThanOrEqual(12);
    const res = await call("GET", "search?q=replay%20destination");
    expect(((await res.json()) as { results: unknown[] }).results.length).toBeGreaterThan(0);
  });
});

describe("HookPilot support chat", () => {
  it("answers with a citation and sends no account identifiers to the model", async () => {
    await ready;
    const u = await signUpVerified(uniqueEmail("chat"), "Hana Hook");
    const res = await call("POST", "chat", { jar: u.jar, body: { message: "How do I replay a request to my server?" } });
    const body = (await res.json()) as { mode: string; citations: { url: string }[] };
    expect(body.mode).toBe("ai");
    expect(body.citations[0]!.url).toMatch(/^\/help\//);
    const payload = JSON.stringify(create.mock.calls.at(-1)![0]);
    for (const secret of [u.email, "Hana Hook", u.userId, u.orgId]) expect(payload).not.toContain(secret);
  });

  it("caps message length and rejects cross-origin posts", async () => {
    await ready;
    expect((await call("POST", "chat", { body: { message: "x".repeat(2001) } })).status).toBe(413);
    expect((await call("POST", "chat", { body: { message: "hi" }, origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "tickets", { body: { subject: "s", message: "m" }, origin: "https://evil.example" })).status).toBe(403);
  });

  it("per-IP limit follows Fly-Client-IP; X-Forwarded-For spoofing does not reset it", async () => {
    await ready;
    for (let i = 0; i < 10; i++) {
      expect((await call("POST", "chat", { body: { message: "zzqx" }, ip: "203.0.113.77", headers: { "x-forwarded-for": `10.2.2.${i}` } })).status).toBe(200);
    }
    expect((await call("POST", "chat", { body: { message: "zzqx" }, ip: "203.0.113.77", headers: { "x-forwarded-for": "10.3.3.3" } })).status).toBe(429);
  });
});

describe("HookPilot tickets", () => {
  it("cross-tenant: another customer gets 404 on read and reply", async () => {
    await ready;
    const a = await signUpVerified(uniqueEmail("ta"));
    const b = await signUpVerified(uniqueEmail("tb"));
    const res = await call("POST", "tickets", { jar: a.jar, body: { subject: "Retention", message: "How long are captured requests kept?" } });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await p.support.ticketForViewer(cookies(b.jar), id)).toBeNull();
    expect((await call("POST", `tickets/${id}/reply`, { jar: b.jar, body: { message: "mine now" } })).status).toBe(404);
    expect((await p.support.ticketForViewer(cookies(a.jar), id))?.ticket.id).toBe(id);
  });

  it("an abuse report escalates with an operator email and an incident", async () => {
    await ready;
    const res = await call("POST", "tickets", {
      body: { subject: "Abuse", message: "Someone is using a HookPilot endpoint for phishing collection, please report this endpoint. It is abuse.", email: "reporter@example.com" },
    });
    const body = (await res.json()) as { id: string; escalated: boolean; status: string };
    expect(body).toMatchObject({ escalated: true, status: "waiting_on_operator" });
    const { rows } = await p.ex.query(`SELECT 1 FROM ops_email_outbox WHERE to_address = 'ops@hookpilot.test' AND tag = 'support.operator_alert'`);
    expect(rows.length).toBeGreaterThan(0);
    const { rows: inc } = await p.ex.query(`SELECT 1 FROM incidents WHERE fingerprint = $1`, [`support:escalation:${body.id}`]);
    expect(inc).toHaveLength(1);
  });

  it("operator replies email the customer; customers get 404 on admin routes", async () => {
    await ready;
    const cust = await signUpVerified(uniqueEmail("cust"));
    const op = await signUpVerified(uniqueEmail("op"));
    await p.ex.query(`UPDATE auth_user SET role = 'operator' WHERE id = $1`, [op.userId]);
    const res = await call("POST", "tickets", { jar: cust.jar, body: { subject: "Masking", message: "Which headers are masked in the inspector?" } });
    const { id } = (await res.json()) as { id: string };
    expect((await call("POST", `admin/tickets/${id}/status`, { jar: cust.jar, body: { status: "closed" } })).status).toBe(404);
    expect((await call("POST", `admin/tickets/${id}/reply`, { jar: op.jar, body: { message: "Authorization and cookies are masked." } })).status).toBe(200);
    const { rows } = await p.ex.query<{ text_body: string }>(`SELECT text_body FROM ops_email_outbox WHERE to_address = $1 AND tag = 'support.ticket_reply'`, [cust.email]);
    expect(rows[0]!.text_body).toContain("Authorization and cookies are masked.");
  });
});
