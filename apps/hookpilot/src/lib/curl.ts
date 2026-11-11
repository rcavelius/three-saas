import { displayHeaderValue, maskQueryString } from "./sensitive";

/** Headers that curl sets itself or that proxies added; replaying them would be wrong. */
const SKIP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "accept-encoding",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  "te",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
  "forwarded",
  "via",
]);

/** POSIX single-quote escaping. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface CurlInput {
  captureUrl: string;
  method: string;
  path: string;
  query: string;
  headers: [string, string][];
  /** Decoded text body, or null for binary/no body. */
  bodyText: string | null;
  bodySize: number;
  truncated: boolean;
  /** When false (default), secrets are masked. */
  revealSecrets?: boolean;
}

/** Builds a curl command that re-sends the captured request to the same capture URL. */
export function buildCurl(r: CurlInput): string {
  const reveal = r.revealSecrets ?? false;
  const path = r.path === "/" ? "" : r.path;
  const query = r.query ? `?${reveal ? r.query : maskQueryString(r.query)}` : "";
  const parts: string[] = [`curl -X ${r.method} ${shellQuote(`${r.captureUrl}${path}${query}`)}`];
  for (const [name, value] of r.headers) {
    if (SKIP_HEADERS.has(name.toLowerCase()) || name.toLowerCase().startsWith("x-vercel-")) continue;
    parts.push(`-H ${shellQuote(`${name}: ${displayHeaderValue(name, value, reveal)}`)}`);
  }
  const notes: string[] = [];
  if (r.bodySize > 0) {
    if (r.bodyText !== null) {
      parts.push(`--data-binary ${shellQuote(r.bodyText)}`);
    } else {
      parts.push(`--data-binary @body.bin`);
      notes.push("# binary body: save it as body.bin first (Copy body / raw download)");
    }
    if (r.truncated) notes.push("# body was truncated when captured; this replays only the stored part");
  }
  if (r.method === "HEAD") parts[0] = parts[0]!.replace("curl -X HEAD", "curl -I");
  return [...notes, parts.join(" \\\n  ")].join("\n");
}
