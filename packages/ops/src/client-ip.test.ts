import { describe, expect, it } from "vitest";
import { clientIpConfigFromEnv, getClientIp, normalizeIp, rateLimitKeyForIp, type ClientIpConfig } from "./client-ip";

function h(entries: [string, string][]): Headers {
  const headers = new Headers();
  for (const [k, v] of entries) headers.append(k, v);
  return headers;
}

describe("clientIpConfigFromEnv", () => {
  it("parses every supported mode", () => {
    expect(clientIpConfigFromEnv({})).toEqual({ mode: "none" });
    expect(clientIpConfigFromEnv({ TRUSTED_PROXY: "none" })).toEqual({ mode: "none" });
    expect(clientIpConfigFromEnv({ TRUSTED_PROXY: "fly" })).toEqual({ mode: "fly" });
    expect(clientIpConfigFromEnv({ TRUSTED_PROXY: "Cloudflare" })).toEqual({ mode: "cloudflare" });
    expect(clientIpConfigFromEnv({ TRUSTED_PROXY: "render" })).toEqual({ mode: "render", trustedHops: 1 });
    expect(clientIpConfigFromEnv({ TRUSTED_PROXY: "xff:2" })).toEqual({ mode: "xff", trustedHops: 2 });
  });
  it("rejects invalid values loudly", () => {
    for (const v of ["xff", "xff:0", "xff:11", "xff:-1", "aws", "xff:1;fly"]) {
      expect(() => clientIpConfigFromEnv({ TRUSTED_PROXY: v })).toThrow(/TRUSTED_PROXY/);
    }
  });
});

describe("normalizeIp", () => {
  it("accepts IP literals and canonicalises IPv6", () => {
    expect(normalizeIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp(" 2001:DB8:0:0:0:0:0:1 ")).toBe("2001:db8::1");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("203.0.113.7:8080")).toBe("203.0.113.7");
    expect(normalizeIp("::ffff:198.51.100.1")).toBe("198.51.100.1");
  });
  it("rejects garbage", () => {
    for (const v of ["", "unknown", "localhost", "1.2.3", "999.1.1.1", "1.2.3.4.5", "<script>", "fe80::1%eth0", "a".repeat(100), "1.2.3.4 5.6.7.8"]) {
      expect(normalizeIp(v)).toBeNull();
    }
  });
});

describe("getClientIp", () => {
  const fly: ClientIpConfig = { mode: "fly" };
  const cf: ClientIpConfig = { mode: "cloudflare" };
  const render: ClientIpConfig = { mode: "render", trustedHops: 1 };
  const xff2: ClientIpConfig = { mode: "xff", trustedHops: 2 };

  it("fly uses only Fly-Client-IP", () => {
    expect(getClientIp(h([["fly-client-ip", "198.51.100.10"], ["x-forwarded-for", "1.1.1.1"]]), fly)).toBe("198.51.100.10");
    expect(getClientIp(h([["x-forwarded-for", "1.1.1.1"], ["cf-connecting-ip", "2.2.2.2"]]), fly)).toBeNull();
  });

  it("cloudflare uses only CF-Connecting-IP", () => {
    expect(getClientIp(h([["cf-connecting-ip", "2001:db8::abcd"], ["fly-client-ip", "9.9.9.9"]]), cf)).toBe("2001:db8::abcd");
    expect(getClientIp(h([["fly-client-ip", "9.9.9.9"]]), cf)).toBeNull();
  });

  it("rejects duplicated single-value headers and garbage", () => {
    expect(getClientIp(h([["fly-client-ip", "1.1.1.1"], ["fly-client-ip", "2.2.2.2"]]), fly)).toBeNull();
    expect(getClientIp(h([["fly-client-ip", "not-an-ip"]]), fly)).toBeNull();
    expect(getClientIp(h([["cf-connecting-ip", "' OR 1=1 --"]]), cf)).toBeNull();
  });

  it("render/xff ignore attacker-prepended X-Forwarded-For entries", () => {
    // Client sends "X-Forwarded-For: 6.6.6.6"; Render appends the real peer.
    const spoofed = h([["x-forwarded-for", "6.6.6.6, 203.0.113.9"]]);
    expect(getClientIp(spoofed, render)).toBe("203.0.113.9");
    // Two trusted hops (CDN appends client, LB appends CDN): n-th from the right.
    const twoHops = h([["x-forwarded-for", "6.6.6.6, 7.7.7.7, 203.0.113.9, 10.0.0.2"]]);
    expect(getClientIp(twoHops, xff2)).toBe("203.0.113.9");
  });

  it("handles multiple X-Forwarded-For header lines in order", () => {
    const multi = h([
      ["x-forwarded-for", "6.6.6.6"],
      ["x-forwarded-for", "203.0.113.9, 10.0.0.2"],
    ]);
    expect(getClientIp(multi, xff2)).toBe("203.0.113.9");
    expect(getClientIp(multi, render)).toBe("10.0.0.2");
  });

  it("returns null when fewer entries than trusted hops, or the trusted slot is garbage", () => {
    expect(getClientIp(h([["x-forwarded-for", "203.0.113.9"]]), xff2)).toBeNull();
    expect(getClientIp(h([["x-forwarded-for", "1.1.1.1, garbage"]]), render)).toBeNull();
    expect(getClientIp(h([["x-forwarded-for", "1.1.1.1,"]]), render)).toBeNull();
    expect(getClientIp(h([]), render)).toBeNull();
  });

  it("normalises IPv6 from X-Forwarded-For", () => {
    expect(getClientIp(h([["x-forwarded-for", "1.1.1.1, 2001:0DB8:0000::0001"]]), render)).toBe("2001:db8::1");
  });

  it("none never reads headers", () => {
    const all = h([
      ["fly-client-ip", "1.1.1.1"],
      ["cf-connecting-ip", "1.1.1.1"],
      ["x-forwarded-for", "1.1.1.1"],
      ["x-real-ip", "1.1.1.1"],
    ]);
    expect(getClientIp(all, { mode: "none" })).toBeNull();
  });
});

describe("rateLimitKeyForIp", () => {
  it("buckets IPv6 to /64 and keeps IPv4 exact", () => {
    expect(rateLimitKeyForIp("203.0.113.7")).toBe("ip4:203.0.113.7");
    expect(rateLimitKeyForIp("2001:db8:1:2:aaaa::1")).toBe("ip6:2001:0db8:0001:0002::/64");
    expect(rateLimitKeyForIp("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe(rateLimitKeyForIp("2001:db8:1:2::9"));
    expect(rateLimitKeyForIp("2001:db8:1:3::1")).not.toBe(rateLimitKeyForIp("2001:db8:1:2::1"));
    expect(rateLimitKeyForIp("::1")).toBe("ip6:0000:0000:0000:0000::/64");
    expect(rateLimitKeyForIp("::ffff:1.2.3.4")).toBe("ip4:1.2.3.4");
    expect(rateLimitKeyForIp(null)).toBe("ip:unknown");
    expect(rateLimitKeyForIp("junk")).toBe("ip:unknown");
  });
});

describe("netlify mode", () => {
  it("reads only Netlify's edge header, never X-Forwarded-For", () => {
    const h = new Headers({ "x-nf-client-connection-ip": "203.0.113.77", "x-forwarded-for": "10.0.0.1" });
    expect(getClientIp(h, { mode: "netlify" })).toBe("203.0.113.77");
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.5" }), { mode: "netlify" })).toBeNull();
    expect(clientIpConfigFromEnv({ TRUSTED_PROXY: "netlify" })).toEqual({ mode: "netlify" });
  });
});
