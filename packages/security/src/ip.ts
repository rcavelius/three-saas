/**
 * IP address classification for SSRF protection.
 *
 * Rule: an address is "public" only when ipaddr.js classifies it as plain "unicast" AND (for IPv6) it lies
 * inside global unicast space 2000::/3 and is not an IPv4-compatible/mapped/translated form. Everything else
 * (loopback, private, link-local, CGNAT, multicast, reserved, documentation, benchmarking, 6to4, Teredo,
 * NAT64, unique-local, ...) is rejected. This is an allow-list, so ranges ipaddr.js gains later stay blocked.
 */
import ipaddr from "ipaddr.js";

export type ParsedIp = ipaddr.IPv4 | ipaddr.IPv6;

const GLOBAL_UNICAST_V6 = ipaddr.IPv6.parse("2000::");

/** Strictly parses an IP literal (dotted-quad IPv4 or IPv6, optional [brackets] / %zone). Returns null otherwise. */
export function parseIp(input: string): ParsedIp | null {
  let s = input.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (ipaddr.IPv4.isValidFourPartDecimal(s)) return ipaddr.IPv4.parse(s);
  if (s.includes(":") && ipaddr.IPv6.isValid(s)) {
    try {
      return ipaddr.IPv6.parse(s);
    } catch {
      return null;
    }
  }
  return null;
}

/** Returns a range label. Only "unicast" means publicly routable. */
export function classifyAddress(input: string): string {
  const addr = parseIp(input);
  if (!addr) return "invalid";
  if (addr.kind() === "ipv4") return (addr as ipaddr.IPv4).range();

  const v6 = addr as ipaddr.IPv6;
  if (v6.isIPv4MappedAddress()) return "ipv4Mapped";
  const range = v6.range();
  if (range !== "unicast") return range;
  // ::/96 IPv4-compatible (deprecated) addresses like ::127.0.0.1 are reported as "unicast" by ipaddr.js.
  if (v6.parts.slice(0, 6).every((p) => p === 0)) return "ipv4Compatible";
  if (!v6.match(GLOBAL_UNICAST_V6, 3)) return "nonGlobalUnicast";
  return "unicast";
}

export function isPublicAddress(input: string): boolean {
  return classifyAddress(input) === "unicast";
}

export function isLoopbackAddress(input: string): boolean {
  const addr = parseIp(input);
  if (!addr) return false;
  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    return (addr as ipaddr.IPv6).toIPv4Address().range() === "loopback";
  }
  return addr.range() === "loopback";
}

export function ipFamily(input: string): 4 | 6 {
  const addr = parseIp(input);
  return addr?.kind() === "ipv6" ? 6 : 4;
}
