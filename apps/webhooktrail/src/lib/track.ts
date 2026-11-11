"use client";

/**
 * First-party analytics (no third parties): POSTs an allow-listed event name to /api/events.
 * Names: pageview, signup_started, signup_completed, checkout_started, tool_used, upgrade_clicked.
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

export function track(name: string, props?: Record<string, string | number | boolean>): void {
  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, anonymousId: anonymousId(), path: location.pathname, props }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* analytics never breaks the page */
  }
}
