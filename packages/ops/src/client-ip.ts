/**
 * Client IP extraction behind a known proxy.
 *
 * The only safe way to read a client IP from headers is to know exactly which proxy sits in front of
 * the app and read only the header that proxy *sets* (overwrites). Anything a client can send itself,
 * such as the left-most X-Forwarded-For entry, is attacker-controlled and must never be used for rate
 * limiting or abuse decisions.
 *
 * Modes (env TRUSTED_PROXY):
 *  - fly         `Fly-Client-IP`, set by Fly's edge proxy (overwrites any client value).
 *  - cloudflare  `CF-Connecting-IP`, set by Cloudflare (only safe if the origin accepts traffic from
 *                Cloudflare alone, e.g. a tunnel or Cloudflare-only firewall rules).
 *  - render      Right-most X-Forwarded-For entry. ASSUMPTION (Render docs, "Request headers"): Render's
 *                load balancer appends the address of the peer that connected to it to
 *                X-Forwarded-For, so the right-most entry is the client as seen by Render and everything
 *                to its left is client-supplied. If you put another proxy/CDN in front of Render, use
 *                `xff:<n>` with the total number of trusted hops instead.
 *  - xff:<n>     The n-th address from the RIGHT of X-Forwarded-For (n = number of trusted proxies that
 *                each append one entry). Fewer than n entries => null (request did not traverse them).
 *  - none        Never read headers (local dev, or unknown topology). Returns null.
 */
import { isIP } from "node:net";

export type ClientIpConfig =
  | { mode: "fly" | "cloudflare" | "render" | "xff"; trustedHops?: number }
  | { mode: "none" };

export function clientIpConfigFromEnv(env: Record<string, string | undefined>): ClientIpConfig {
  const raw = (env.TRUSTED_PROXY ?? "").trim().toLowerCase();
  if (raw === "" || raw === "none") return { mode: "none" };
  if (raw === "fly" || raw === "cloudflare") return { mode: raw };
  if (raw === "render") return { mode: "render", trustedHops: 1 };
  const m = /^xff:(\d{1,2})$/.exec(raw);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 10) return { mode: "xff", trustedHops: n };
  }
  throw new Error(`TRUSTED_PROXY must be one of fly | cloudflare | render | xff:<1-10> | none (got "${raw}")`);
}

/**
 * Parses one address as it appears in a proxy header. Accepts an optional port ("1.2.3.4:80",
 * "[::1]:80") and returns the canonical form, or null if it is not an IP literal.
 * IPv4-mapped IPv6 (::ffff:1.2.3.4) is reduced to IPv4 so both spellings share a rate-limit bucket.
 */
export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  if (v.length === 0 || v.length > 64) return null;
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(v);
  if (bracketed) v = bracketed[1]!;
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  if (v.includes("%")) return null; // zone ids never come from the internet
  const kind = isIP(v);
  if (kind === 4) return v;
  if (kind !== 6) return null;
  const canonical = canonicalIpv6(v);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(canonical);
  if (mapped && isIP(mapped[1]!) === 4) return mapped[1]!;
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1]!, 16);
    const lo = parseInt(mappedHex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return canonical;
}

/** RFC 5952 canonical form, via the WHATWG URL parser (lower-case, longest zero run compressed). */
function canonicalIpv6(v: string): string {
  return new URL(`http://[${v}]/`).hostname.slice(1, -1);
}

function expandIpv6(v: string): string[] {
  const [head, tail] = v.split("::") as [string, string | undefined];
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = tail === undefined ? 0 : 8 - h.length - t.length;
  return [...h, ...Array<string>(missing).fill("0"), ...t].map((g) => g.padStart(4, "0"));
}

/**
 * Rate-limit key for an address. IPv6 is bucketed to its /64 because a single customer line is
 * usually handed a whole /64 and can rotate through it freely.
 */
export function rateLimitKeyForIp(ip: string | null): string {
  const n = normalizeIp(ip);
  if (!n) return "ip:unknown";
  if (isIP(n) === 4) return `ip4:${n}`;
  const groups = canonicalIpv6(n).includes(".") ? null : expandIpv6(canonicalIpv6(n));
  if (!groups || groups.length !== 8) return `ip6:${n}`;
  return `ip6:${groups.slice(0, 4).join(":")}::/64`;
}

/** A single-valued header. Duplicate headers (joined with ",") are treated as tampering. */
function single(headers: Headers, name: string): string | null {
  const v = headers.get(name);
  if (v === null || v.includes(",")) return null;
  return normalizeIp(v);
}

export function getClientIp(headers: Headers, cfg: ClientIpConfig): string | null {
  switch (cfg.mode) {
    case "none":
      return null;
    case "fly":
      return single(headers, "fly-client-ip");
    case "cloudflare":
      return single(headers, "cf-connecting-ip");
    case "render":
    case "xff": {
      const hops = cfg.trustedHops ?? 1;
      if (!Number.isInteger(hops) || hops < 1) return null;
      // Headers.get joins repeated X-Forwarded-For lines with ", " in arrival order, which is
      // exactly the order proxies append in, so counting from the right stays correct.
      const raw = headers.get("x-forwarded-for");
      if (!raw) return null;
      const parts = raw.split(",").map((p) => p.trim());
      if (parts.length < hops) return null;
      return normalizeIp(parts[parts.length - hops]);
    }
    default:
      return null;
  }
}
