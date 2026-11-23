/**
 * First-party, cookie-less product analytics: a tiny `track(name, props)` that posts to our own
 * /api/events (connect-src 'self'; no third-party analytics).
 *
 * Privacy rule enforced HERE, in the browser, before anything is sent: an event can only carry the
 * properties listed in EVENT_SPEC, and each one is either a small integer count or one of a fixed set
 * of words. File names, column names, cell values and free text can never be attached, because no
 * property accepts arbitrary strings.
 */

type PropSpec = "count" | readonly string[];

export const EVENT_SPEC = {
  pageview: {},
  signup_started: { plan: ["free", "pro", "business"] },
  /** The sign-up form was submitted (signup_started fires when the form is shown); outcome = what the server said. */
  signup_submitted: { plan: ["free", "pro", "business"], outcome: ["sent", "error"] },
  signup_completed: {},
  checkout_started: { plan: ["pro", "business"] },
  /** An upgrade prompt was shown (so prompts seen vs. clicked can be compared). */
  upgrade_shown: { plan: ["pro", "business"], from: ["limit", "files", "download", "workflows"] },
  upgrade_clicked: { plan: ["pro", "business"], from: ["pricing", "billing", "limit", "workflows", "team", "files", "download", "home", "tool_page"] },
  /** A file was refused before cleaning; reason only, never the file name. */
  file_rejected: { reason: ["too_big", "too_many_files", "too_many_rows", "unsupported", "memory", "unreadable"] },
  /** Someone downloaded a messy sample file from a tool page. */
  sample_downloaded: {},
  tool_used: {
    action: ["clean", "download_csv", "download_xlsx", "download_zip", "download_batch_xlsx"],
    mode: ["single", "merge", "batch"],
    files: "count",
    steps: "count",
    format: ["csv", "tsv", "xlsx", "zip_csv", "zip_xlsx"],
    /** Whether the cleaned data is the built-in sample or the visitor's own file. */
    source: ["sample", "file"],
  },
} as const satisfies Record<string, Record<string, PropSpec>>;

export type EventName = keyof typeof EVENT_SPEC;
type PropsOf<N extends EventName> = { [K in keyof (typeof EVENT_SPEC)[N]]?: (typeof EVENT_SPEC)[N][K] extends readonly string[] ? (typeof EVENT_SPEC)[N][K][number] : number };

export interface EventPayload {
  name: EventName;
  anonymousId: string | null;
  path: string;
  props: Record<string, string | number>;
}

/** Keeps only allow-listed props with allowed values; counts are clamped integers 0..10000. */
export function sanitizeEventProps(name: EventName, props: Record<string, unknown> = {}): Record<string, string | number> {
  const spec = EVENT_SPEC[name] as Record<string, PropSpec>;
  const out: Record<string, string | number> = {};
  for (const [key, rule] of Object.entries(spec)) {
    const v = props[key];
    if (v === undefined || v === null) continue;
    if (rule === "count") {
      if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.max(0, Math.min(10_000, Math.round(v)));
    } else if (typeof v === "string" && rule.includes(v)) {
      out[key] = v;
    }
  }
  return out;
}

const ANON_KEY = "gridrinse.anon.v1";
/** Key used before the product rename; read as a fallback so the anonymous id stays stable. */
const LEGACY_ANON_KEY = "datapolish.anon.v1";

function anonymousId(): string | null {
  try {
    let id = window.localStorage.getItem(ANON_KEY);
    if (!id) {
      const legacy = window.localStorage.getItem(LEGACY_ANON_KEY);
      if (legacy && /^[A-Za-z0-9_-]{8,64}$/.test(legacy)) {
        id = legacy;
        window.localStorage.setItem(ANON_KEY, id);
      }
    }
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function buildEvent<N extends EventName>(name: N, props?: PropsOf<N>, pathname?: string): EventPayload {
  return {
    name,
    anonymousId: typeof window !== "undefined" ? anonymousId() : null,
    // Pathname only: query strings and fragments are never sent.
    path: (pathname ?? (typeof location !== "undefined" ? location.pathname : "/")).slice(0, 200),
    props: sanitizeEventProps(name, props as Record<string, unknown> | undefined),
  };
}

/** Fire-and-forget. Never throws, never blocks the page. */
export function track<N extends EventName>(name: N, props?: PropsOf<N>): void {
  try {
    if (typeof window === "undefined") return;
    const body = JSON.stringify(buildEvent(name, props));
    // fetch keepalive (survives navigation like a beacon) rather than sendBeacon, so the exact body is
    // visible in devtools and in the end-to-end no-upload test.
    void fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true, credentials: "same-origin" }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}
