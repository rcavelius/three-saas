/**
 * Staging protection: HTTP Basic auth in front of every page and API route of a non-public deployment,
 * plus noindex. Enabled only when STAGING_PASSWORD is set (>= 12 chars). Machine endpoints that carry
 * their own authentication (cron bearer secret, Stripe-signed webhooks, health) can be exempted.
 *
 *   const gate = stagingGate({ password: process.env.STAGING_PASSWORD, exempt: ["/api/cron/", "/api/health"] });
 *   const denied = gate(req); if (denied) return denied;
 */
import { createHash, timingSafeEqual } from "node:crypto";

export interface StagingGateOptions {
  password: string | undefined;
  /** Username shown in the browser prompt; any username is accepted, only the password is checked. */
  realm?: string;
  /** Path prefixes that skip the gate (they must authenticate themselves). */
  exempt?: string[];
}

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

export function stagingEnabled(password: string | undefined): password is string {
  return typeof password === "string" && password.length >= 12;
}

/** Returns a 401 Response when the request lacks the staging password, or null to let it through. */
export function stagingGate(opts: StagingGateOptions): (req: Request) => Response | null {
  if (!stagingEnabled(opts.password)) return () => null;
  const expected = digest(opts.password);
  const exempt = opts.exempt ?? [];
  const realm = (opts.realm ?? "Staging").replace(/["\\\r\n]/g, "");
  return (req) => {
    const path = new URL(req.url).pathname;
    if (exempt.some((p) => path === p || path.startsWith(p))) return null;
    const header = req.headers.get("authorization") ?? "";
    const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header.trim());
    if (m) {
      const decoded = Buffer.from(m[1]!, "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx >= 0 && timingSafeEqual(digest(decoded.slice(idx + 1)), expected)) return null;
    }
    return new Response("Staging site: password required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  };
}
