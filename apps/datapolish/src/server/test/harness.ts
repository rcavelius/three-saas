/**
 * Test harness: the real platform (Better Auth, billing, ops, workflows) on in-memory PGlite with
 * FakeStripe (signed webhooks verified by the real Stripe SDK). Requests go through the same route
 * functions the Next route files use.
 */
import { randomInt } from "node:crypto";
import type { EmailMessage } from "@repo/auth";
import { DATAPOLISH_CATALOG } from "@repo/billing";
import { FakeStripe } from "@repo/billing/testing";
import { createDb } from "@repo/database";
import { silentLogger } from "@repo/ops";
import { loadEnv } from "../env";
import { createPlatform, type Platform } from "../platform";
import * as routes from "../routes";

export const BASE = "http://localhost:3102";
export const PASSWORD = "correct horse battery staple";
export const WHSEC = "whsec_test_secret_for_datapolish_tests";
export const CRON = "cron-secret-for-tests-0123456789abcdef";

export type Jar = Map<string, string>;

export function randomIp(): string {
  return `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

function absorb(jar: Jar, res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";");
    const idx = pair!.indexOf("=");
    const name = pair!.slice(0, idx).trim();
    const value = pair!.slice(idx + 1).trim();
    if (attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

export interface CallOpts {
  method?: string;
  body?: unknown;
  rawBody?: string;
  jar?: Jar;
  /** null = no Origin header. Default: the app origin. */
  origin?: string | null;
  ip?: string;
  headers?: Record<string, string>;
}

type Handler = (p: Platform, req: Request, id: string) => Promise<Response>;

export async function makeApp(o: { authRateLimit?: boolean; now?: () => Date; trustedProxy?: string; stripe?: "fake" | "none" } = {}) {
  const now = o.now ?? (() => new Date());
  const emails: EmailMessage[] = [];
  const fake = new FakeStripe({ webhookSecret: WHSEC, catalogs: [DATAPOLISH_CATALOG], now });
  const env = loadEnv({
    NODE_ENV: "test",
    APP_URL: BASE,
    SESSION_SECRET: "test-session-secret-0123456789-abcdefghijklmnop",
    STRIPE_WEBHOOK_SECRET: WHSEC,
    TRUSTED_PROXY: o.trustedProxy ?? "fly",
    CRON_SECRET: CRON,
    DATABASE_URL: "pglite:memory",
    OWNER_ALERT_EMAIL: "owner@datapolish.test",
  });
  const p = await createPlatform({
    env,
    handle: createDb("pglite:memory", {}),
    stripe: o.stripe === "none" ? null : fake,
    now,
    logger: silentLogger,
    authRateLimit: o.authRateLimit ?? false,
    onEmail: (m) => emails.push(m),
  });

  async function call(handler: Handler, path: string, opts: CallOpts = {}, id = ""): Promise<Response> {
    const headers = new Headers(opts.headers);
    headers.set("fly-client-ip", opts.ip ?? randomIp());
    if (opts.origin !== null) headers.set("origin", opts.origin ?? BASE);
    if (opts.jar && opts.jar.size) headers.set("cookie", [...opts.jar].map(([k, v]) => `${k}=${v}`).join("; "));
    let body: string | undefined = opts.rawBody;
    if (opts.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(opts.body);
    }
    const method = opts.method ?? (body !== undefined ? "POST" : "GET");
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    const res = await handler(p, new Request(url, { method, headers, body }), id);
    if (opts.jar) absorb(opts.jar, res);
    return res;
  }

  const auth = (path: string, opts: CallOpts = {}) => call((pp, r) => routes.authRoute(pp, r), path.startsWith("http") ? path : `/api/auth${path}`, opts);

  function lastEmail(to: string, tag: string): EmailMessage {
    const m = [...emails].reverse().find((e) => e.to === to && e.tag === tag);
    if (!m) throw new Error(`no ${tag} email to ${to}`);
    return m;
  }
  const linkIn = (m: EmailMessage) => {
    const match = m.text.match(/https?:\/\/\S+/);
    if (!match) throw new Error("no link in email");
    return match[0];
  };

  /** Sign up, follow the verification link (auto sign-in), return the cookie jar + ids. */
  async function user(email: string, name = "Test User") {
    const r = await auth("/sign-up/email", { body: { email, password: PASSWORD, name } });
    if (r.status !== 200) throw new Error(`sign-up ${r.status} ${await r.text()}`);
    const jar: Jar = new Map();
    const v = await auth(linkIn(lastEmail(email, "auth.verify-email")), { jar, origin: null });
    if (v.status >= 400) throw new Error(`verify ${v.status}`);
    const s = await p.auth.getSession(new Headers({ cookie: [...jar].map(([k, val]) => `${k}=${val}`).join("; ") }));
    if (!s) throw new Error("no session");
    const { rows } = await p.handle.executor.query<{ organization_id: string }>(`SELECT organization_id FROM auth_member WHERE user_id = $1`, [s.user.id]);
    return { jar, userId: s.user.id, orgId: rows[0]!.organization_id, email };
  }

  /** Deliver all queued FakeStripe events to the app's webhook route. */
  async function deliverWebhooks() {
    const out: number[] = [];
    for (const d of fake.takeEvents()) {
      const r = await call((pp, req) => routes.webhookRouteHandler(pp, req), "/api/billing/webhook", { rawBody: d.payload, origin: null, headers: { "stripe-signature": d.header, "content-type": "application/json" } });
      out.push(r.status);
    }
    return out;
  }

  /** Owner subscribes through the app's checkout route and Stripe completes it. */
  async function subscribe(jar: Jar, planId: "pro" | "business") {
    const r = await call((pp, req) => routes.checkoutRouteHandler(pp, req), "/api/billing/checkout", { jar, body: { planId } });
    if (r.status !== 200) throw new Error(`checkout ${r.status} ${await r.text()}`);
    const { url } = (await r.json()) as { url: string };
    const sessionId = url.split("/").pop()!;
    const subId = fake.completeCheckout(sessionId);
    await deliverWebhooks();
    return subId;
  }

  const wf = {
    list: (jar: Jar, ip?: string) => call((pp, r) => routes.listWorkflowsRoute(pp, r), "/api/workflows", { jar, ip }),
    create: (jar: Jar, body: unknown, opts: CallOpts = {}) => call((pp, r) => routes.createWorkflowRoute(pp, r), "/api/workflows", { jar, body, ...opts }),
    get: (jar: Jar, id: string) => call((pp, r, i) => routes.getWorkflowRoute(pp, r, i), `/api/workflows/${id}`, { jar }, id),
    update: (jar: Jar, id: string, body: unknown, opts: CallOpts = {}) => call((pp, r, i) => routes.updateWorkflowRoute(pp, r, i), `/api/workflows/${id}`, { jar, body, method: "PUT", ...opts }, id),
    remove: (jar: Jar, id: string, opts: CallOpts = {}) => call((pp, r, i) => routes.deleteWorkflowRoute(pp, r, i), `/api/workflows/${id}`, { jar, method: "DELETE", ...opts }, id),
  };
  const entitlements = (jar?: Jar, ip?: string) => call((pp, r) => routes.entitlementsRoute(pp, r), "/api/me/entitlements", { jar, ip });

  return { p, fake, emails, call, auth, user, lastEmail, linkIn, deliverWebhooks, subscribe, wf, entitlements, routes, close: () => p.handle.close() };
}

export type App = Awaited<ReturnType<typeof makeApp>>;

export const STEPS = [
  { type: "trim" },
  { type: "removeBlankRows" },
  { type: "findReplace", find: "N/A", replace: "" },
];
