"use client";

import { track } from "./analytics";

export type PassFrom = "download" | "limit" | "files" | "pricing";

/** The page to come back to after checkout: this path (the claim route adds ?pass=<status>). */
export function currentReturnPath(): string {
  if (typeof window === "undefined") return "/";
  const u = new URL(window.location.href);
  u.searchParams.delete("pass");
  u.searchParams.delete("sample");
  return (u.pathname + u.search).slice(0, 300);
}

/**
 * Starts Stripe Checkout for a one-time pass (no account needed) and leaves the page. Resolves to a readable
 * error message when checkout could not start (the page stays as it is).
 */
export async function startPassCheckout(passId: string, from: PassFrom, returnPath: string = currentReturnPath()): Promise<string | null> {
  track("pass_checkout_started", { pass: passId as "day", from });
  try {
    const res = await fetch("/api/billing/pass/checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passId, returnPath }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (res.ok && body.url) {
      window.location.assign(body.url);
      return null;
    }
    return body.message ?? "Checkout is not available right now. Nothing was charged.";
  } catch {
    return "Could not reach the server. Nothing was charged.";
  }
}

/** "Mon, Nov 23, 3:04 PM" in the visitor's own time zone. */
export function formatPassTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}
