"use client";

/**
 * First-party, cookie-less product analytics: POST /api/events (same origin). The anonymous id is a
 * random value in localStorage, never linked to an IP; the user id is added server-side from the session.
 */
import type { EventName } from "@/lib/events";

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

export type TrackName = EventName;

export function track(name: TrackName, props?: Record<string, string | number | boolean | null>): void {
  try {
    const body = JSON.stringify({ name, anonymousId: anonymousId(), path: window.location.pathname, props: props ?? null });
    void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
  } catch {
    /* analytics must never break the page */
  }
}
