import { randomInt } from "node:crypto";
import { createDb, CORE_MIGRATIONS } from "@repo/database";
import { createAuth, type CreateAuthOptions } from "../auth";
import { AUTH_MIGRATIONS } from "../migrations";
import type { EmailMessage } from "../emails";

export const BASE = "http://localhost:3000";
export const SECRET = "test-secret-test-secret-test-secret-0123456789";
export const PASSWORD = "correct horse battery";

export type Jar = Map<string, string>;

export function randomIp(): string {
  return `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

export function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function headersFor(jar: Jar): Headers {
  return new Headers({ cookie: cookieHeader(jar) });
}

/** Applies Set-Cookie headers to a jar (deletions via Max-Age=0 / empty value). */
export function absorb(jar: Jar, res: Response): void {
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";");
    const idx = pair!.indexOf("=");
    const name = pair!.slice(0, idx).trim();
    const value = pair!.slice(idx + 1).trim();
    const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === "";
    if (expired) jar.delete(name);
    else jar.set(name, value);
  }
}

export async function setup(over: Partial<CreateAuthOptions> = {}) {
  const handle = createDb("pglite:memory", {});
  await handle.migrate([...CORE_MIGRATIONS, ...AUTH_MIGRATIONS]);
  const emails: EmailMessage[] = [];
  const auth = createAuth({
    handle,
    appName: "TestApp",
    baseURL: BASE,
    secret: SECRET,
    cookiePrefix: "tp",
    sendEmail: async (m) => {
      emails.push(m);
    },
    ...over,
  });

  async function call(
    path: string,
    o: { method?: string; body?: unknown; jar?: Jar; origin?: string | null; ip?: string; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const headers = new Headers(o.headers);
    headers.set("x-forwarded-for", o.ip ?? randomIp());
    if (o.origin !== null) headers.set("origin", o.origin ?? BASE);
    if (o.jar && o.jar.size > 0) headers.set("cookie", cookieHeader(o.jar));
    let body: string | undefined;
    if (o.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(o.body);
    }
    const url = path.startsWith("http") ? path : `${BASE}/api/auth${path}`;
    const res = await auth.handler(new Request(url, { method: o.method ?? (body ? "POST" : "GET"), headers, body }));
    if (o.jar) absorb(o.jar, res);
    return res;
  }

  function lastEmail(to: string, tag: string): EmailMessage {
    const m = [...emails].reverse().find((e) => e.to === to && e.tag === tag);
    if (!m) throw new Error(`no ${tag} email to ${to}`);
    return m;
  }

  function linkIn(m: EmailMessage): string {
    const match = m.text.match(/https?:\/\/\S+/);
    if (!match) throw new Error("no link in email");
    return match[0];
  }

  async function signUp(email: string, name = "Test User", password = PASSWORD) {
    return call("/sign-up/email", { body: { email, password, name } });
  }

  async function signIn(email: string, password = PASSWORD, jar: Jar = new Map()) {
    const res = await call("/sign-in/email", { body: { email, password }, jar });
    return { res, jar };
  }

  /** Signs up, follows the verification link (auto sign-in) and returns the session jar. */
  async function verifiedUser(email: string, name = "Test User") {
    const r = await signUp(email, name);
    if (r.status !== 200) throw new Error(`sign-up failed ${r.status} ${await r.text()}`);
    const jar: Jar = new Map();
    const v = await call(linkIn(lastEmail(email, "auth.verify-email")), { jar, origin: null });
    if (v.status >= 400) throw new Error(`verify failed ${v.status}`);
    const s = await auth.getSession(headersFor(jar));
    if (!s) throw new Error("no session after verification");
    return { jar, user: s.user, session: s.session };
  }

  return { handle, auth, emails, call, lastEmail, linkIn, signUp, signIn, verifiedUser, close: () => handle.close() };
}

export type TestCtx = Awaited<ReturnType<typeof setup>>;
