/**
 * Staging protection: HTTP Basic auth in front of every page and API route of a non-public deployment,
 * plus noindex. No node:* imports: it runs inside Next.js proxy.ts, which Netlify executes as an Edge
 * Function (Deno). Enabled only when STAGING_PASSWORD is set (>= 12 chars). Machine endpoints that carry
 * their own authentication (cron bearer secret, Stripe-signed webhooks, health) can be exempted.
 *
 *   const gate = stagingGate({ password: process.env.STAGING_PASSWORD, exempt: ["/api/cron/", "/api/health"] });
 *   const denied = gate(req); if (denied) return denied;
 */

export interface StagingGateOptions {
  password: string | undefined;
  /** Username shown in the browser prompt; any username is accepted, only the password is checked. */
  realm?: string;
  /** Path prefixes that skip the gate (they must authenticate themselves). */
  exempt?: string[];
}

/** Constant-time comparison of UTF-8 strings (time depends only on the longer length, not on content). */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  const n = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function decodeBase64(b64: string): string | null {
  try {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function stagingEnabled(password: string | undefined): password is string {
  return typeof password === "string" && password.length >= 12;
}

/** Returns a 401 Response when the request lacks the staging password, or null to let it through. */
export function stagingGate(opts: StagingGateOptions): (req: Request) => Response | null {
  if (!stagingEnabled(opts.password)) return () => null;
  const expected = opts.password;
  const exempt = opts.exempt ?? [];
  const realm = (opts.realm ?? "Staging").replace(/["\\\r\n]/g, "");
  return (req) => {
    const path = new URL(req.url).pathname;
    if (exempt.some((p) => path === p || path.startsWith(p))) return null;
    const header = req.headers.get("authorization") ?? "";
    const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(header.trim());
    if (m) {
      const decoded = decodeBase64(m[1]!);
      const idx = decoded?.indexOf(":") ?? -1;
      if (decoded && idx >= 0 && safeEqual(decoded.slice(idx + 1), expected)) return null;
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
