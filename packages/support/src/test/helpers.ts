/** Test setup: in-memory PGlite with the real migrations, a fake auth, the real ops mailer (outbox) and a mocked Anthropic client. */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createDb, CORE_MIGRATIONS, type DbHandle } from "@repo/database";
import { AUTH_MIGRATIONS } from "@repo/auth";
import { OPS_MIGRATIONS, createMailer, type Brand, type ClientIpConfig } from "@repo/ops";
import { SUPPORT_MIGRATIONS } from "../migrations";
import { createSupport, type SupportAuth, type SupportOptions, type SupportUser } from "../service";
import type { AnthropicLike } from "../ai";

export const APP_URL = "https://app.example.test";
export const brand: Brand = { name: "TestApp", url: APP_URL, primaryColor: "#0f766e" };

export const ARTICLES: Record<string, string> = {
  "cancel-subscription": `---
title: Cancel your subscription
slug: cancel-subscription
summary: How to cancel a paid plan from the billing page; refunds are handled by a person.
category: Plans & billing
updated: 2026-11-01
---
## Cancel from the billing page

Owners open **/account/billing** and choose *Manage billing* to cancel. The plan stays active until the end of the period.

## Refunds

Refunds are reviewed by a person. Open a ticket at [support](/support).
`,
  "reset-password": `---
title: Reset your password
slug: reset-password
summary: Use the forgot-password page to get a reset link by email.
category: Account & security
updated: 2026-11-01
---
## Getting a reset link

Go to /forgot-password and enter your email. The link expires after 1 hour.
`,
  "plans-and-limits": `---
title: Plans and limits
slug: plans-and-limits
summary: What each plan includes.
category: Plans & billing
updated: 2026-11-01
---
## Free plan

The free plan includes 25 pages per scan. Paid plans raise the limit; you can cancel any time.
`,
  "delete-account": `---
title: Delete your account
slug: delete-account
summary: Delete your account and data from the account page.
category: Account & security
updated: 2026-11-01
---
## Deleting

Open /account, enter your password and confirm. Workspaces you own alone are deleted.
`,
};

export function writeArticles(files: Record<string, string> = ARTICLES): string {
  const dir = mkdtempSync(join(tmpdir(), "support-help-"));
  mkdirSync(dir, { recursive: true });
  for (const [slug, body] of Object.entries(files)) writeFileSync(join(dir, `${slug}.md`), body);
  return dir;
}

export async function makeDb(): Promise<DbHandle<any>> {
  const handle = createDb("pglite:memory", {});
  await handle.migrate([...CORE_MIGRATIONS, ...AUTH_MIGRATIONS, ...OPS_MIGRATIONS, ...SUPPORT_MIGRATIONS]);
  return handle;
}

export interface FakeUser extends SupportUser {
  orgId?: string;
  role?: "owner" | "admin" | "member";
  platformRole?: "customer" | "operator" | "owner";
}

/** Auth keyed by the `x-test-user` header (stands in for a session cookie). */
export function fakeAuth(users: Record<string, FakeUser>): SupportAuth {
  return {
    async getSession(h) {
      const u = users[h.get("x-test-user") ?? ""];
      return u ? { user: { id: u.id, email: u.email, emailVerified: u.emailVerified } } : null;
    },
    async requireOrg(h) {
      const u = users[h.get("x-test-user") ?? ""];
      if (!u) throw Object.assign(new Error("Sign in required"), { name: "AuthError", status: 401, code: "UNAUTHENTICATED" });
      if (!u.orgId) throw Object.assign(new Error("No active organization"), { name: "AuthError", status: 404, code: "NO_ACTIVE_ORGANIZATION" });
      return { user: { id: u.id, email: u.email, emailVerified: u.emailVerified }, org: { id: u.orgId }, role: u.role ?? "member" };
    },
  };
}

export async function insertUsers(handle: DbHandle<any>, users: Record<string, FakeUser>): Promise<void> {
  for (const u of Object.values(users)) {
    await handle.executor.query(`INSERT INTO auth_user (id, name, email, email_verified, role) VALUES ($1, 'T', $2, $3, $4)`, [
      u.id,
      u.email,
      Boolean(u.emailVerified),
      u.platformRole ?? "customer",
    ]);
  }
}

export const USERS: Record<string, FakeUser> = {
  alice: { id: "u-alice", email: "alice@a.example", emailVerified: true, orgId: "org-a", role: "owner" },
  amy: { id: "u-amy", email: "amy@a.example", emailVerified: true, orgId: "org-a", role: "member" },
  andy: { id: "u-andy", email: "andy@a.example", emailVerified: true, orgId: "org-a", role: "member" },
  bob: { id: "u-bob", email: "bob@b.example", emailVerified: false, orgId: "org-b", role: "owner" },
  olga: { id: "u-olga", email: "olga@ops.example", emailVerified: true, orgId: "org-ops", role: "owner", platformRole: "operator" },
};

/** A Message as the SDK would return it. */
export function modelMessage(body: unknown, o: { stop?: Anthropic.StopReason; input?: number; output?: number; raw?: string } = {}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text: o.raw ?? JSON.stringify(body), citations: null }],
    stop_reason: o.stop ?? "end_turn",
    stop_sequence: null,
    usage: { input_tokens: o.input ?? 900, output_tokens: o.output ?? 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

export function mockClient(impl: (body: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message> | Anthropic.Message) {
  const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming, _opts?: unknown) => impl(body));
  const client: AnthropicLike = { messages: { create } };
  return { client, create };
}

export function makeClock(start = "2026-11-11T10:00:00Z") {
  let t = new Date(start).getTime();
  const clock = () => new Date(t);
  return Object.assign(clock, {
    advance(ms: number) {
      t += ms;
    },
    set(d: string) {
      t = new Date(d).getTime();
    },
  });
}

export async function setup(over: Partial<SupportOptions> & { users?: Record<string, FakeUser>; clientIp?: ClientIpConfig } = {}) {
  const handle = await makeDb();
  const users = over.users ?? USERS;
  await insertUsers(handle, users);
  const clock = makeClock();
  const mailer = createMailer({ handle, from: "TestApp <no-reply@example.test>", brand, now: clock });
  const support = createSupport({
    app: "testapp",
    handle,
    auth: fakeAuth(users),
    mailer,
    brand,
    appUrl: APP_URL,
    clientIp: over.clientIp ?? { mode: "fly" },
    tokenSecret: "test-secret-test-secret-test-secret-0123",
    operatorEmail: "ops@example.test",
    contentDir: writeArticles(),
    getPlanName: async (orgId) => (orgId === "org-a" ? "Agency" : "Free"),
    now: clock,
    ...over,
  });
  await support.ensureArticles();

  async function call(
    path: string,
    o: { method?: string; body?: unknown; form?: Record<string, string>; user?: string; ip?: string; origin?: string | null; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const headers = new Headers(o.headers);
    if (o.origin !== null) headers.set("origin", o.origin ?? APP_URL);
    if (o.user) headers.set("x-test-user", o.user);
    headers.set("fly-client-ip", o.ip ?? "203.0.113.7");
    let body: BodyInit | undefined;
    if (o.form) {
      headers.set("content-type", "application/x-www-form-urlencoded");
      body = new URLSearchParams(o.form).toString();
    } else if (o.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(o.body);
    }
    const url = `${APP_URL}/api/support/${path}`;
    const req = new Request(url, { method: o.method ?? (body ? "POST" : "GET"), headers, body });
    return support.handle(req, path.split("?")[0]!.split("/"));
  }

  async function outbox() {
    const { rows } = await handle.executor.query<{ to_address: string; subject: string; text_body: string; tag: string }>(
      `SELECT to_address, subject, text_body, tag FROM ops_email_outbox ORDER BY created_at, id`,
    );
    return rows;
  }

  async function incidents() {
    const { rows } = await handle.executor.query<{ fingerprint: string; severity: string; title: string; status: string }>(
      `SELECT fingerprint, severity, title, status FROM incidents ORDER BY created_at`,
    );
    return rows;
  }

  return { handle, support, clock, mailer, call, outbox, incidents, close: () => handle.close() };
}

export type Ctx = Awaited<ReturnType<typeof setup>>;
