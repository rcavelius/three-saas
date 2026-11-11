/**
 * Sensitive header / query-parameter detection and masking. Pure functions shared by the server
 * (for anything that might be logged) and the browser UI (masked by default, click to reveal).
 */
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-csrf-token",
  "x-xsrf-token",
  "apikey",
  "x-access-token",
]);

const SENSITIVE_HEADER_SUFFIX = /-(signature|token|secret|api-?key|password|session|credentials?)(-[a-z0-9]+)?$/i;
const SENSITIVE_HEADER_PREFIX = /^(x-)?(signature|token|secret|password)$/i;
const SENSITIVE_QUERY_KEY = /(token|secret|signature|sig|password|passwd|api[_-]?key|apikey|auth|key|session|code)$/i;

export const MASK = "••••••••";

export function isSensitiveHeader(name: string): boolean {
  const n = name.trim().toLowerCase();
  return SENSITIVE_HEADER_NAMES.has(n) || SENSITIVE_HEADER_SUFFIX.test(n) || SENSITIVE_HEADER_PREFIX.test(n);
}

export function isSensitiveQueryKey(key: string): boolean {
  return SENSITIVE_QUERY_KEY.test(key.trim());
}

/** Masks a header value but keeps harmless structure (auth scheme, cookie names). */
export function maskHeaderValue(name: string, value: string): string {
  const n = name.trim().toLowerCase();
  if (n === "authorization" || n === "proxy-authorization") {
    const m = /^([A-Za-z][A-Za-z0-9_-]*)\s+\S/.exec(value);
    return m ? `${m[1]} ${MASK}` : MASK;
  }
  if (n === "cookie") {
    return value
      .split(";")
      .map((part) => {
        const eq = part.indexOf("=");
        if (eq === -1) return MASK;
        return `${part.slice(0, eq).trim()}=${MASK}`;
      })
      .join("; ");
  }
  if (n === "set-cookie") {
    const eq = value.indexOf("=");
    const semi = value.indexOf(";");
    const name0 = eq === -1 ? "" : value.slice(0, eq).trim();
    const attrs = semi === -1 ? "" : value.slice(semi);
    return name0 ? `${name0}=${MASK}${attrs}` : MASK;
  }
  return MASK;
}

export function displayHeaderValue(name: string, value: string, revealed: boolean): string {
  return !revealed && isSensitiveHeader(name) ? maskHeaderValue(name, value) : value;
}

/** Returns headers with sensitive values masked (for logs and default UI rendering). */
export function maskHeaders(headers: ReadonlyArray<readonly [string, string]>): [string, string][] {
  return headers.map(([k, v]) => [k, isSensitiveHeader(k) ? maskHeaderValue(k, v) : v]);
}

/** Masks values of sensitive-looking query parameters in a raw query string (no leading "?"). */
export function maskQueryString(query: string): string {
  if (!query) return query;
  return query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      let key = pair.slice(0, eq);
      try {
        key = decodeURIComponent(key.replace(/\+/g, " "));
      } catch {
        /* keep raw */
      }
      return isSensitiveQueryKey(key) ? `${pair.slice(0, eq)}=${MASK}` : pair;
    })
    .join("&");
}
