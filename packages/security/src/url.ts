/**
 * Target URL validation: scheme, credentials, port, hostname shape, IP literals (including obfuscated encodings).
 * DNS resolution is checked separately in ./resolve.ts.
 */
import { SafeFetchError } from "./errors";
import { parseIp } from "./ip";
import { PUBLIC_ONLY_POLICY, type AddressPolicy } from "./policy";

export const MAX_URL_LENGTH = 2048;

/** Special-use / internal names that must never be fetched even if some resolver answers for them. */
const BLOCKED_SUFFIXES = [
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "private",
  "arpa",
  "test",
  "invalid",
  "example",
  "onion",
  "alt",
];

const LABEL = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/;

export interface ValidatedUrl {
  url: URL;
  /** Hostname without brackets or trailing dot. */
  hostname: string;
  /** Set when the host is an IP literal (already checked against the policy). */
  ipLiteral?: string;
  port: number;
}

function rawHostOf(input: string): string | null {
  const m = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)/.exec(input);
  if (!m) return null;
  let authority = m[1]!;
  const at = authority.lastIndexOf("@");
  if (at >= 0) authority = authority.slice(at + 1);
  if (authority.startsWith("[")) {
    const end = authority.indexOf("]");
    return end > 0 ? authority.slice(0, end + 1) : authority;
  }
  const colon = authority.indexOf(":");
  return (colon >= 0 ? authority.slice(0, colon) : authority).toLowerCase();
}

/** Throws SafeFetchError if the URL may not be fetched under the policy. */
export function validateTargetUrl(input: string | URL, policy: AddressPolicy = PUBLIC_ONLY_POLICY): ValidatedUrl {
  const raw = typeof input === "string" ? input.trim() : input.href;
  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    throw new SafeFetchError("INVALID_URL", "URL is empty or too long");
  }
  // Control chars, whitespace and backslashes are parsed inconsistently between URL parsers.
  if (/[\u0000- \u007f\\]/.test(raw)) {
    throw new SafeFetchError("INVALID_URL", "URL contains whitespace, control characters or backslashes");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("INVALID_URL", "URL could not be parsed");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("BLOCKED_SCHEME", `Scheme ${url.protocol} is not allowed`, { url: raw });
  }
  if (url.username || url.password) {
    throw new SafeFetchError("BLOCKED_CREDENTIALS", "URLs with embedded credentials are not allowed", { url: raw });
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!policy.allowPort(port)) {
    throw new SafeFetchError("BLOCKED_PORT", `Port ${port} is not allowed`, { url: raw });
  }
  url.hash = "";

  const host = url.hostname;
  if (host.startsWith("[")) {
    const ip = host.slice(1, -1);
    if (!parseIp(ip) || !policy.allowAddress(ip)) {
      throw new SafeFetchError("BLOCKED_ADDRESS", "IP address is not publicly routable", { url: raw });
    }
    return { url, hostname: ip, ipLiteral: ip, port };
  }

  if (parseIp(host)) {
    // WHATWG URL silently converts 2130706433, 0x7f.1, 0177.0.0.1, 127.1, %31%32%37... into dotted quads.
    // Only accept the canonical spelling the user typed, so obfuscated encodings never reach the network.
    const typed = rawHostOf(raw);
    if (typed !== null && typed.replace(/\.$/, "") !== host) {
      throw new SafeFetchError("BLOCKED_HOST", "Non-canonical IP address encodings are not allowed", { url: raw });
    }
    if (!policy.allowAddress(host)) {
      throw new SafeFetchError("BLOCKED_ADDRESS", "IP address is not publicly routable", { url: raw });
    }
    return { url, hostname: host, ipLiteral: host, port };
  }

  const name = host.replace(/\.$/, "");
  const labels = name.split(".");
  if (name.length > 253 || labels.length < 2 || !labels.every((l) => LABEL.test(l))) {
    throw new SafeFetchError("BLOCKED_HOST", "Hostname is not a fully-qualified public domain name", { url: raw });
  }
  const tld = labels[labels.length - 1]!;
  if (/^[0-9]+$/.test(tld) || /^0x/i.test(tld)) {
    throw new SafeFetchError("BLOCKED_HOST", "Hostname looks like an encoded IP address", { url: raw });
  }
  for (const suffix of BLOCKED_SUFFIXES) {
    if (name === suffix || name.endsWith("." + suffix)) {
      throw new SafeFetchError("BLOCKED_HOST", `Hostnames under .${suffix} are not allowed`, { url: raw });
    }
  }
  if (name !== host) url.hostname = name;
  return { url, hostname: name, port };
}

/** Non-throwing variant for form validation. */
export function checkTargetUrl(
  input: string,
  policy?: AddressPolicy,
): { ok: true; url: URL } | { ok: false; code: string; message: string } {
  try {
    return { ok: true, url: validateTargetUrl(input, policy).url };
  } catch (err) {
    if (err instanceof SafeFetchError) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}
