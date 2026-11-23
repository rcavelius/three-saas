/**
 * POST /api/scan implementation, as a factory so tests can inject the DB executor and scanner network deps.
 * Order: same-origin check -> body size -> zod -> URL validation (SSRF rules) -> per-IP + per-target rate limits ->
 * in-process concurrency slot -> scan (NDJSON progress stream or plain JSON) -> persist -> result with report id.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { checkTargetUrl } from "@repo/security";
import { rateLimit, type SqlExecutor } from "@repo/database";
import type { Logger } from "@repo/monitoring";
import { getClientIp, rateLimitKeyForIp, type ClientIpConfig } from "@repo/ops";
import { FREE_LIMITS, runScan, type RunScanOptions } from "./scanner/scan";
import { DEFAULT_FREE_REPORT_ISSUES, gateReport, type LockedSummary, type ReportEnts } from "./report-gate";
import type { ScanDeps, ScanReport } from "./scanner/types";
import { saveScan } from "./scans-repo";

export const scanRequestSchema = z.object({
  url: z.string().trim().min(1, "Enter a website address").max(2048, "That address is too long"),
});

export const MAX_BODY_BYTES = 4096;

/** Accepts "example.com" style input by assuming https. */
export function normalizeInputUrl(input: string): string {
  const s = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^:]+:\d+(\/|$)/.test(s)) return s; // e.g. "javascript:" -> rejected later
  return `https://${s.replace(/^\/+/, "")}`;
}

/** Rate-limit bucket for a request: the client IP resolved per TRUSTED_PROXY (IPv6 bucketed by /64). */
export function clientBucket(headers: Headers, cfg: ClientIpConfig): string {
  return rateLimitKeyForIp(getClientIp(headers, cfg));
}

export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export class ScanSlots {
  private active = 0;
  constructor(private readonly max: number) {}
  tryAcquire(): (() => void) | null {
    if (this.active >= this.max) return null;
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
  get inUse(): number {
    return this.active;
  }
}

export interface ScanHandlerOptions {
  getExecutor: () => Promise<SqlExecutor>;
  scanDeps: () => ScanDeps;
  slots: ScanSlots;
  ipLimitPerHour: number;
  targetLimitPerHour: number;
  retentionDays: number;
  /** From TRUSTED_PROXY via clientIpConfigFromEnv; "none" puts every client in one bucket. */
  clientIp: ClientIpConfig;
  appUrl: string;
  logger?: Logger;
  scanOptions?: Pick<RunScanOptions, "limits">;
  /**
   * The requester's entitlements (signed-in plan + pass cookie). They set the page cap (pagesPerScan, never below
   * the free cap) and how much of the report the response may contain (fullReport / reportIssues). Default: free.
   * Must not throw for anonymous visitors.
   */
  resolveAccess?: (req: Request) => Promise<ReportEnts>;
}

const FREE_ACCESS: ReportEnts = { limits: { reportIssues: DEFAULT_FREE_REPORT_ISSUES, pagesPerScan: FREE_LIMITS.maxPages }, features: {} };

/** Crawl time budget grows with the page cap (same rule as monitoring scans). */
export function scanTimeBudget(pages: number): number {
  return Math.min(150_000, Math.max(FREE_LIMITS.timeBudgetMs, 45_000 + pages * 100));
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/** Never leak internals (stack traces, DB errors) to the client. */
function publicError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  return msg === "Scan cancelled" ? "The scan was cancelled." : "The scan failed unexpectedly. Please try again.";
}

export function createScanHandler(o: ScanHandlerOptions) {
  return async function POST(req: Request): Promise<Response> {
    // Cross-site POSTs: browsers always send Origin on POST; require it to match our host if present.
    const origin = req.headers.get("origin");
    if (origin) {
      let ok = false;
      try {
        const host = req.headers.get("host");
        const o2 = new URL(origin);
        ok = o2.host === host || o2.origin === new URL(o.appUrl).origin;
      } catch {
        ok = false;
      }
      if (!ok) return json(403, { error: "Cross-origin requests are not allowed." });
    }
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return json(415, { error: "Send JSON: {\"url\": \"https://example.com\"}" });
    }
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return json(413, { error: "Request body too large." });
    let raw: string;
    try {
      raw = await req.text();
    } catch {
      return json(400, { error: "Could not read the request body." });
    }
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "Request body too large." });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: "Request body is not valid JSON." });
    }
    const parsed = scanRequestSchema.safeParse(body);
    if (!parsed.success) return json(400, { error: parsed.error.issues[0]?.message ?? "Invalid request." });

    const check = checkTargetUrl(normalizeInputUrl(parsed.data.url));
    if (!check.ok) {
      const friendly: Record<string, string> = {
        BLOCKED_SCHEME: "Only http:// and https:// websites can be scanned.",
        BLOCKED_PORT: "Only websites on the standard ports (80 and 443) can be scanned.",
        BLOCKED_CREDENTIALS: "Remove the username/password from the address.",
        BLOCKED_HOST: "That address is not a public website (local, internal or encoded IP addresses are not scanned).",
        BLOCKED_ADDRESS: "That address points to a private or reserved network and cannot be scanned.",
        INVALID_URL: "That does not look like a valid website address.",
      };
      return json(400, { error: friendly[check.code] ?? "That address cannot be scanned.", code: check.code });
    }
    const target = check.url;

    let ex: SqlExecutor;
    try {
      ex = await o.getExecutor();
    } catch (err) {
      o.logger?.error("db unavailable", { err });
      return json(503, { error: "The service is temporarily unavailable." });
    }
    const bucket = clientBucket(req.headers, o.clientIp);
    const ipLimit = await rateLimit(ex, `scan:ip:${hashKey(bucket)}`, o.ipLimitPerHour, 3_600_000);
    if (!ipLimit.allowed) {
      const retry = Math.max(1, Math.ceil((ipLimit.resetAt.getTime() - Date.now()) / 1000));
      return json(
        429,
        { error: `Free scans are limited to ${o.ipLimitPerHour} per hour. Try again in ${Math.ceil(retry / 60)} minutes.` },
        { "retry-after": String(retry) },
      );
    }
    const hostLimit = await rateLimit(ex, `scan:host:${hashKey(target.hostname)}`, o.targetLimitPerHour, 3_600_000);
    if (!hostLimit.allowed) {
      const retry = Math.max(1, Math.ceil((hostLimit.resetAt.getTime() - Date.now()) / 1000));
      return json(429, { error: "This website has been scanned many times in the last hour. Please try again later." }, { "retry-after": String(retry) });
    }
    let access: ReportEnts = FREE_ACCESS;
    if (o.resolveAccess) {
      try {
        access = await o.resolveAccess(req);
      } catch (err) {
        o.logger?.warn("access lookup failed; using free limits", { err });
        access = FREE_ACCESS;
      }
    }
    const pageCap = Math.max(FREE_LIMITS.maxPages, Math.min(1000, access.limits.pagesPerScan ?? FREE_LIMITS.maxPages));
    const limits: RunScanOptions["limits"] = {
      ...(pageCap > FREE_LIMITS.maxPages ? { maxPages: pageCap, timeBudgetMs: scanTimeBudget(pageCap) } : {}),
      ...o.scanOptions?.limits,
    };

    const release = o.slots.tryAcquire();
    if (!release) {
      return json(503, { error: "All scanners are busy right now. Please try again in a minute." }, { "retry-after": "30" });
    }

    const abort = new AbortController();
    req.signal?.addEventListener("abort", () => abort.abort(), { once: true });
    const log = o.logger?.child({ host: target.hostname });

    type Done = { id: string; report: ScanReport; locked: LockedSummary | null };
    const execute = async (onProgress?: RunScanOptions["onProgress"]): Promise<Done | { error: string; status: number }> => {
      const started = Date.now();
      try {
        const report = await runScan(target.href, o.scanDeps(), { ...o.scanOptions, limits, onProgress, signal: abort.signal });
        const start = report.pages[0];
        if (report.pages.length === 1 && start?.status === null && /non-public|not publicly routable|not allowed/.test(start.error ?? "")) {
          // DNS pointed at a private network: refuse instead of storing a report about it.
          return { error: "That address resolves to a private or reserved network and cannot be scanned.", status: 400 };
        }
        const id = await saveScan(ex, report, o.retentionDays);
        log?.info("scan complete", { id, ms: Date.now() - started, pages: report.stats.pagesCrawled, score: report.score });
        // The full report is stored (a later pass unlocks it); the response carries only what this requester may see.
        const gated = gateReport(report, access);
        return { id, report: gated.report, locked: gated.locked };
      } catch (err) {
        log?.error("scan failed", { err });
        return { error: publicError(err), status: 500 };
      } finally {
        release();
      }
    };

    const wantsStream = (req.headers.get("accept") ?? "").includes("application/x-ndjson");
    if (!wantsStream) {
      const r = await execute();
      return "error" in r ? json(r.status, { error: r.error }) : json(200, { id: r.id, reportUrl: `/report/${r.id}`, report: r.report, locked: r.locked });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const send = (obj: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          } catch {
            closed = true;
          }
        };
        send({ type: "accepted", url: target.href, maxPages: limits?.maxPages ?? FREE_LIMITS.maxPages });
        const r = await execute((p) => send({ type: "progress", event: p }));
        if ("error" in r) send({ type: "error", error: r.error });
        else send({ type: "result", id: r.id, reportUrl: `/report/${r.id}`, report: r.report, locked: r.locked });
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* client went away */
          }
        }
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
      },
    });
  };
}
