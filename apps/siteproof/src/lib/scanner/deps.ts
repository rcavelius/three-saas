import { inspectTls, safeFetch } from "@repo/security";
import type { ScanDeps } from "./types";

export function botUserAgent(appUrl: string): string {
  return `SiteProofBot/1.0 (+${appUrl.replace(/\/+$/, "")}/bot)`;
}

/**
 * Production network access: always the public-only address policy and the OS resolver (safeFetch defaults).
 * There is deliberately no parameter here that can change the policy.
 */
export function createProductionDeps(appUrl: string): ScanDeps {
  const userAgent = botUserAgent(appUrl);
  return {
    fetch: (url, o) =>
      safeFetch(url, {
        method: o.method,
        followRedirects: o.followRedirects,
        maxBodyBytes: o.maxBodyBytes,
        onOversize: o.onOversize ?? "truncate",
        timeoutMs: o.timeoutMs,
        connectTimeoutMs: Math.min(5_000, o.timeoutMs),
        signal: o.signal,
        userAgent,
      }),
    inspectTls: (url, timeoutMs) => inspectTls(url, { timeoutMs }),
  };
}
