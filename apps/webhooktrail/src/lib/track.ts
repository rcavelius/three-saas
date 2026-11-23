"use client";

/**
 * First-party analytics (no third parties): POSTs an allow-listed event name to /api/events.
 * Names: pageview, signup_started, signup_completed, checkout_started, tool_used, upgrade_clicked, and the pass
 * events in lib/analytics-events.ts (paywall_shown, pass_checkout_started, pass_activated).
 * The first pageview of a page load also carries the referrer's origin (never its path or query) and
 * utm_* values; the server keeps only the host and short tokens.
 */
function anonymousId(): string {
  try {
    let id = localStorage.getItem("wt_aid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("wt_aid", id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

let landingSent = false;

function landingSource(): { referrer?: string; utm?: Record<string, string>; landing?: boolean } {
  const out: { referrer?: string; utm?: Record<string, string>; landing?: boolean } = {};
  try {
    const ref = document.referrer ? new URL(document.referrer).origin : "";
    if (ref) out.referrer = ref.slice(0, 200);
    // A visit starts here unless this page load came from one of our own pages.
    out.landing = ref !== location.origin;
    const q = new URLSearchParams(location.search);
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

export function track(name: string, props?: Record<string, string | number | boolean>): void {
  try {
    const landing = name === "pageview" && !landingSent ? landingSource() : {};
    if (name === "pageview") landingSent = true;
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, anonymousId: anonymousId(), path: location.pathname, props, ...landing }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* analytics never breaks the page */
  }
}
