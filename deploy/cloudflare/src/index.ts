/**
 * Cloudflare edge for one app (ChangeKite, GridRinse or WebhookTrail). The same source is deployed three
 * times with a different wrangler.<app>.jsonc. Responsibilities:
 *   - www.<domain> -> <domain> redirect
 *   - optional Basic-auth gate (STAGING_PASSWORD secret) for a non-public launch; machine endpoints that
 *     authenticate themselves (signed webhooks, cron bearer, health, WebhookTrail capture URLs) are exempt
 *   - forward every request to the app's container (our existing Docker image, port 8080)
 *   - Cron Trigger -> POST /api/cron/tick inside the container (wakes it if asleep)
 * The container receives its configuration as environment variables at start. When a secret changes
 * (wrangler secret bulk), the next request notices the fingerprint changed and restarts the container.
 */
import { DurableObject } from "cloudflare:workers";
import { stagingGate } from "../../../packages/ops/src/staging";

const PORT = 8080;
const INSTANCE = "main";

/** Variables passed through to the container process (anything else in the Worker env stays at the edge). */
const CONTAINER_ENV_KEYS = [
  "APP_URL",
  "DATABASE_URL",
  "DATABASE_POOL_MAX",
  "REQUIRE_POSTGRES",
  "SESSION_SECRET",
  "CRON_SECRET",
  "HEALTH_DETAILS_SECRET",
  "TRUSTED_PROXY",
  "RUN_SCHEDULER",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "SUPPORT_EMAIL",
  "OWNER_ALERT_EMAIL",
  "SUPPORT_OPERATOR_EMAIL",
  "UPTIME_URLS",
  "ANTHROPIC_API_KEY",
  "SUPPORT_AI_MODEL",
  "SUPPORT_AI_MONTHLY_BUDGET_CENTS",
  "SUPPORT_AI_DAILY_BUDGET_CENTS",
  "GIT_SHA",
  "LOG_LEVEL",
] as const;

export interface Env {
  APP: DurableObjectNamespace<AppContainer>;
  APP_NAME: string;
  /** Comma-separated path prefixes that skip the staging gate. */
  GATE_EXEMPT: string;
  /** Minutes the container keeps running after the last request. */
  IDLE_MINUTES: string;
  STAGING_PASSWORD?: string;
  [key: string]: unknown;
}

function containerEnv(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CONTAINER_ENV_KEYS) {
    const v = env[k];
    if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}

async function fingerprint(vars: Record<string, string>): Promise<string> {
  const text = Object.keys(vars)
    .sort()
    .map((k) => `${k}=${vars[k]}`)
    .join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class AppContainer extends DurableObject<Env> {
  private starting: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(this.idleMs()));
    }
  }

  private idleMs(): number {
    const m = Number(this.env.IDLE_MINUTES);
    return (Number.isFinite(m) && m >= 1 && m <= 360 ? m : 10) * 60_000;
  }

  override async fetch(request: Request): Promise<Response> {
    this.starting ??= this.ensureReady().finally(() => {
      this.starting = undefined;
    });
    try {
      await this.starting;
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "container not ready", app: this.env.APP_NAME, error: String(err) }));
      return new Response("Service is starting or temporarily unavailable. Please retry in a few seconds.", {
        status: 503,
        headers: { "retry-after": "5", "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
      });
    }
    return this.ctx.container!.getTcpPort(PORT).fetch(request);
  }

  private async ensureReady(): Promise<void> {
    const container = this.ctx.container!;
    const vars = containerEnv(this.env);
    const fp = await fingerprint(vars);
    if (container.running) {
      const current = await this.ctx.storage.get<string>("env_fingerprint");
      if (current === fp) return;
      // Configuration changed since this container started: replace it so it picks up the new values.
      console.log(JSON.stringify({ level: "info", msg: "configuration changed, restarting container", app: this.env.APP_NAME }));
      await container.destroy();
    }
    container.start({ env: vars, enableInternet: true });
    await this.ctx.storage.put("env_fingerprint", fp);
    await container.setInactivityTimeout(this.idleMs());
    const port = container.getTcpPort(PORT);
    let lastError: unknown;
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        const res = await port.fetch("http://container/api/health", { signal: AbortSignal.timeout(2000) });
        await res.body?.cancel();
        return; // any HTTP answer means the server is listening (a 503 means the database is down; the app reports it)
      } catch (err) {
        lastError = err;
        await scheduler.wait(200);
      }
    }
    throw new Error("container did not start listening on port 8080", { cause: lastError });
  }
}

function forwardable(request: Request, url: URL): Request {
  const headers = new Headers(request.headers);
  // The container trusts CF-Connecting-IP (TRUSTED_PROXY=cloudflare). Only this Worker can reach it, and
  // Cloudflare sets this header at the edge, so re-set it explicitly from the edge value.
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("cf-connecting-ip", ip);
  else headers.delete("cf-connecting-ip");
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", url.host);
  const target = new URL(url);
  target.protocol = "http:";
  return new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    const gate = stagingGate({
      password: env.STAGING_PASSWORD,
      realm: `${env.APP_NAME} (not public yet)`,
      exempt: (env.GATE_EXEMPT ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    });
    const denied = gate(request);
    if (denied) return denied;
    const res = await env.APP.getByName(INSTANCE).fetch(forwardable(request, url));
    if (env.STAGING_PASSWORD && env.STAGING_PASSWORD.length >= 12) {
      const out = new Response(res.body, res);
      out.headers.set("X-Robots-Tag", "noindex, nofollow");
      return out;
    }
    return res;
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const secret = env.CRON_SECRET;
    if (typeof secret !== "string" || !secret) {
      console.warn(JSON.stringify({ level: "warn", msg: "CRON_SECRET not set; skipping tick", app: env.APP_NAME }));
      return;
    }
    const appUrl = typeof env.APP_URL === "string" ? env.APP_URL : "https://localhost";
    const req = new Request(new URL("/api/cron/tick", appUrl).toString().replace(/^https:/, "http:"), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "x-forwarded-proto": "https" },
    });
    ctx.waitUntil(
      env.APP.getByName(INSTANCE)
        .fetch(req)
        .then(async (res) => {
          const body = (await res.text()).slice(0, 300);
          const level = res.ok ? "info" : "error";
          console.log(JSON.stringify({ level, msg: "cron tick", app: env.APP_NAME, status: res.status, body }));
        }),
    );
  },
} satisfies ExportedHandler<Env>;
