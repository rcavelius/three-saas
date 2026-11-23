"use client";

/**
 * First-party, cookie-less product analytics: POST /api/events (same origin). The anonymous id is a
 * random value in localStorage, never linked to an IP; the user id is added server-side from the session.
 */
const KEY = "ck_anon_id";

function anonymousId(): string | null {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

let landingSent = false;

/** Referrer origin (never its path or query) and utm_* values, sent once per page load with the first pageview. */
function landingSource(): { referrer?: string; utm?: Record<string, string>; landing?: boolean } {
  const out: { referrer?: string; utm?: Record<string, string>; landing?: boolean } = {};
  try {
    const ref = document.referrer ? new URL(document.referrer).origin : "";
    if (ref) out.referrer = ref.slice(0, 200);
    // A visit starts here unless this page load came from one of our own pages.
    out.landing = ref !== location.origin;
    const q = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of ["source", "medium", "campaign"]) {
      const v = q.get(`utm_${k}`);
      if (v) utm[k] = v.slice(0, 64);
    }
    if (Object.keys(utm).length) out.utm = utm;
  } catch {
    /* ignore */
  }
  return out;
}

export type TrackName = "pageview" | "signup_started" | "signup_completed" | "checkout_started" | "tool_used" | "upgrade_clicked" | "pricing_viewed" | "cta_clicked";

export function track(name: TrackName, props?: Record<string, string | number | boolean | null>): void {
  try {
    const landing = name === "pageview" && !landingSent ? landingSource() : {};
    if (name === "pageview") landingSent = true;
    const body = JSON.stringify({ name, anonymousId: anonymousId(), path: window.location.pathname, props: props ?? null, ...landing });
    void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
  } catch {
    /* analytics must never break the page */
  }
}
