/** Pure formatting helpers used by the inspector UI (no Node APIs: runs in the browser). */

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decodes UTF-8 strictly; returns null for binary data (invalid UTF-8 or control bytes). */
export function decodeText(bytes: Uint8Array, truncated = false): string | null {
  if (bytes.byteLength === 0) return "";
  // A truncated body may end mid-character: decode leniently over the last 3 bytes only.
  const head = truncated && bytes.byteLength > 3 ? bytes.subarray(0, bytes.byteLength - 3) : bytes;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(head);
  } catch {
    return null;
  }
  // Mostly-control content is binary even if it happens to be valid UTF-8.
  let control = 0;
  for (let i = 0; i < Math.min(text.length, 4096); i++) {
    const c = text.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) control++;
  }
  if (control > 0 && control / Math.min(text.length, 4096) > 0.02) return null;
  if (head !== bytes) text += new TextDecoder("utf-8").decode(bytes.subarray(head.byteLength));
  return text;
}

export type JsonParse = { ok: true; value: unknown } | { ok: false; error: string };

export function tryParseJson(text: string): JsonParse {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function baseMediaType(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";")[0]!.trim().toLowerCase();
}

export function isJsonType(ct: string | null | undefined): boolean {
  const t = baseMediaType(ct);
  return t === "application/json" || t.endsWith("+json");
}

export function isFormType(ct: string | null | undefined): boolean {
  return baseMediaType(ct) === "application/x-www-form-urlencoded";
}

export function decodeForm(text: string): [string, string][] {
  return [...new URLSearchParams(text)];
}

export function parseQuery(query: string): [string, string][] {
  if (!query) return [];
  try {
    return [...new URLSearchParams(query)];
  } catch {
    return [];
  }
}

/** Classic 16-bytes-per-row hex dump with ASCII gutter. */
export function hexDump(bytes: Uint8Array, maxBytes = 4096): string {
  const n = Math.min(bytes.byteLength, maxBytes);
  const lines: string[] = [];
  for (let off = 0; off < n; off += 16) {
    const row = bytes.subarray(off, Math.min(off + 16, n));
    const hex = [...row].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = [...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    lines.push(`${off.toString(16).padStart(8, "0")}  ${hex.padEnd(47, " ")}  ${ascii}`);
  }
  if (bytes.byteLength > n) lines.push(`… ${bytes.byteLength - n} more bytes`);
  return lines.join("\n");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function timeUntil(iso: string, now = Date.now()): string {
  const s = Math.round((Date.parse(iso) - now) / 1000);
  if (s <= 0) return "expired";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}
