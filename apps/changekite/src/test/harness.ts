/**
 * Test harness: a full platform on in-memory PGlite with FakeStripe (real webhook signatures), an
 * adjustable clock, a canned "virtual web" for the scanner (no sockets), and helpers that call the
 * app's real route handlers with a cookie jar. Test-only; never imported by app code.
 */
import { randomInt } from "node:crypto";
import { CHANGEKITE_CATALOG } from "@repo/billing";
import { FakeStripe } from "@repo/billing/testing";
import { coreSchema, createDb } from "@repo/database";
import { SafeFetchError, type SafeResponse } from "@repo/security";
import { createPlatform, installPlatform, type Platform } from "@/lib/platform";
import { parseChangekiteEnv } from "@/lib/env";
import type { ScanDeps } from "@/lib/scanner/types";
import { authRouteHandler } from "@/lib/auth-route";
import type { AnthropicLike } from "@repo/support";

export const APP = "http://localhost:3101";
export const PASSWORD = "correct horse battery staple";
export const WEBHOOK_SECRET = "whsec_test_changekite_harness_secret";
export const CRON_SECRET = "cron-secret-for-tests-0123456789";

export type Jar = Map<string, string>;

/** host -> path -> response; a function value can throw to simulate network failures. */
export type VirtualSite = Record<string, { status: number; body?: string; headers?: Record<string, string> } | "down">;
export type VirtualWeb = Map<string, VirtualSite | "down">;

export function page(title: string, links: string[] = []): string {
  const desc = `${title} description that is long enough to satisfy the meta description length check nicely.`;
  return `<!doctype html><html><head><title>${title} - a reasonably long page title</title><meta name="description" content="${desc}"><link rel="canonical" href="PLACEHOLDER"></head><body>${links
    .map((l) => `<a href="${l}">${l}</a>`)
    .join(" ")}</body></html>`;
}

export function virtualDeps(web: VirtualWeb, certDays: { value: number } = { value: 120 }): ScanDeps {
  return {
    fetch: async (url) => {
      const u = new URL(url);
      const site = web.get(u.hostname);
      if (!site || site === "down") throw new SafeFetchError("NETWORK", `connect ECONNREFUSED ${u.hostname}`);
      const entry = site[u.pathname];
      if (entry === "down") throw new SafeFetchError("TIMEOUT", "timed out");
      const r = entry ?? { status: 404, body: "not found" };
      const body = Buffer.from((r.body ?? "").replace("PLACEHOLDER", url));
      const res: SafeResponse = {
        url,
        status: r.status,
        headers: { "content-type": "text/html; charset=utf-8", "strict-transport-security": "max-age=31536000", ...(r.headers ?? {}) },
        body,
        truncated: false,
        redirects: [],
        address: "93.184.215.14",
        elapsedMs: 1,
        text: () => body.toString("utf8"),
      };
      return res;
    },
    inspectTls: async () => ({ valid: true, daysRemaining: certDays.value, address: "93.184.215.14", issuer: "Test CA", validTo: "2030-01-01" }),
  };
}

export function randomIp(): string {
  return `198.51.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

export interface Harness {
  p: Platform;
  stripe: FakeStripe;
  web: VirtualWeb;
  certDays: { value: number };
  clock: { offsetMs: number; advance(ms: number): void };
  call(handler: (req: Request, ctx?: any) => Promise<Response>, method: string, path: string, o?: CallOpts): Promise<Response>;
  auth(path: string, o?: CallOpts): Promise<Response>;
  outbox(to?: string, tag?: string): Promise<{ to_address: string; subject: string; text_body: string; tag: string }[]>;
  signUpVerified(email: string, name?: string): Promise<{ jar: Jar; userId: string; orgId: string }>;
  subscribe(owner: Jar, planId: string): Promise<string>;
  deliverWebhooks(): Promise<number[]>;
  close(): Promise<void>;
}

export interface CallOpts {
  jar?: Jar;
  body?: unknown;
  form?: Record<string, string>;
  origin?: string | null;
  ip?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorb(jar: Jar, res: Response): void {
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";");
    const idx = pair!.indexOf("=");
    const name = pair!.slice(0, idx).trim();
    const value = pair!.slice(idx + 1).trim();
    if (attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

export async function createHarness(envOver: Record<string, string> = {}, extra: { supportAiClient?: AnthropicLike } = {}): Promise<Harness> {
  const clock = {
    offsetMs: 0,
    advance(ms: number) {
      this.offsetMs += ms;
    },
  };
  const now = () => new Date(Date.now() + clock.offsetMs);
  const env = parseChangekiteEnv({
    NODE_ENV: "test",
    APP_URL: APP,
    DATABASE_URL: "pglite:memory",
    SESSION_SECRET: "test-session-secret-0123456789-abcdefghijklmnop",
    STRIPE_SECRET_KEY: "sk_test_harness",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    TRUSTED_PROXY: "xff:1",
    CRON_SECRET,
    MONITOR_HOST_SCANS_PER_HOUR: "50",
    MONITOR_GLOBAL_CONCURRENCY: "2",
    EMAIL_FROM: "ChangeKite <alerts@changekite.test>",
    ...envOver,
  });
  const stripe = new FakeStripe({ webhookSecret: WEBHOOK_SECRET, catalogs: [CHANGEKITE_CATALOG], now });
  const web: VirtualWeb = new Map();
  const certDays = { value: 120 };
  const handle = createDb("pglite:memory", coreSchema);
  const p = await createPlatform({
    env,
    handle,
    stripe,
    now,
    scanDeps: () => virtualDeps(web, certDays),
    scanLimitOverrides: { delayMs: 0, timeBudgetMs: 20_000 },
    supportAiClient: extra.supportAiClient,
    logger: { debug() {}, info() {}, warn() {}, error() {}, child() { return this; } },
  });
  installPlatform(p);

  async function call(handler: (req: Request, ctx?: any) => Promise<Response>, method: string, path: string, o: CallOpts = {}) {
    const headers = new Headers(o.headers);
    headers.set("x-forwarded-for", o.ip ?? randomIp());
    if (o.origin !== null) headers.set("origin", o.origin ?? APP);
    if (o.jar && o.jar.size) headers.set("cookie", cookieHeader(o.jar));
    let body: BodyInit | undefined;
    if (o.form) {
      headers.set("content-type", "application/x-www-form-urlencoded");
      body = new URLSearchParams(o.form).toString();
    } else if (o.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(o.body);
    }
    const url = path.startsWith("http") ? path : `${APP}${path}`;
    const req = new Request(url, { method, headers, body });
    const res = await handler(req, { params: Promise.resolve(o.params ?? {}) });
    if (o.jar) absorb(o.jar, res);
    return res;
  }

  const auth = (path: string, o: CallOpts = {}) =>
    call(authRouteHandler, o.body !== undefined ? "POST" : "GET", path.startsWith("http") ? path : `/api/auth${path}`, o);

  async function outbox(to?: string, tag?: string) {
    const { rows } = await p.handle.executor.query<{ to_address: string; subject: string; text_body: string; tag: string }>(
      `SELECT to_address, subject, text_body, tag FROM ops_email_outbox
       WHERE ($1::text IS NULL OR to_address = $1) AND ($2::text IS NULL OR tag = $2) ORDER BY created_at`,
      [to ?? null, tag ?? null],
    );
    return rows;
  }

  async function signUpVerified(email: string, name = "Test User") {
    const r = await auth("/sign-up/email", { body: { email, password: PASSWORD, name } });
    if (r.status !== 200) throw new Error(`sign-up ${r.status} ${await r.text()}`);
    const mails = await outbox(email, "auth.verify-email");
    const link = mails.at(-1)?.text_body.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error("no verification link");
    const jar: Jar = new Map();
    const v = await auth(link, { jar, origin: null });
    if (v.status >= 400) throw new Error(`verify ${v.status}`);
    const s = await p.auth.requireOrg(new Headers({ cookie: cookieHeader(jar) }));
    return { jar, userId: s.user.id, orgId: s.org.id };
  }

  async function deliverWebhooks() {
    const { webhookHandler } = await import("@/lib/billing-routes");
    const out: number[] = [];
    for (const d of stripe.takeEvents()) {
      const res = await webhookHandler(
        new Request(`${APP}/api/billing/webhook`, { method: "POST", headers: { "stripe-signature": d.header, "content-type": "application/json" }, body: d.payload }),
      );
      out.push(res.status);
    }
    return out;
  }

  async function subscribe(owner: Jar, planId: string) {
    const { checkoutHandler } = await import("@/lib/billing-routes");
    const res = await call(checkoutHandler, "POST", "/api/billing/checkout", { jar: owner, body: { planId } });
    if (res.status !== 200) throw new Error(`checkout ${res.status} ${await res.text()}`);
    const { url } = (await res.json()) as { url: string };
    const sessionId = url.split("/").pop()!;
    const subId = stripe.completeCheckout(sessionId);
    await deliverWebhooks();
    return subId;
  }

  return {
    p,
    stripe,
    web,
    certDays,
    clock,
    call,
    auth,
    outbox,
    signUpVerified,
    subscribe,
    deliverWebhooks,
    close: async () => {
      installPlatform(null);
      await handle.close();
    },
  };
}

/** A small healthy site: home links to /about and /contact. */
export function healthySite(): VirtualSite {
  return {
    "/": { status: 200, body: page("Home", ["/about", "/contact"]) },
    "/about": { status: 200, body: page("About", ["/"]) },
    "/contact": { status: 200, body: page("Contact", ["/"]) },
    "/robots.txt": { status: 200, body: "User-agent: *\nAllow: /\n", headers: { "content-type": "text/plain" } },
  };
}
