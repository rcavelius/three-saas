"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/client/track";
import { CopyLink } from "./CopyLink";

export type PassReturnStatus = "active" | "unpaid" | "expired" | "revoked" | "invalid" | "error" | "canceled";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";

/** Message after coming back from Checkout (?pass=…). Fires the analytics event once and tidies the address bar. */
export function PassReturnNotice({ status, expiresAt, context = "report" }: { status: PassReturnStatus; expiresAt: string | null; context?: "report" | "page" }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (status === "canceled") track("pass_checkout_canceled", { pass: "report" });
    else track("pass_activated", { pass: "report", status });
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("pass");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch {
      /* keep the URL */
    }
  }, [status]);

  if (status === "canceled") {
    return (
      <p role="status" className="no-print mb-5 border-l-2 border-rule-strong bg-paper-deep px-4 py-3 text-ink-soft">
        Checkout was cancelled. Nothing was charged.
      </p>
    );
  }
  const msg: Record<Exclude<PassReturnStatus, "canceled">, { text: string; cls: string }> = {
    active: {
      text: `Pass active until ${expiresAt ? fmt(expiresAt) : "its end date"}. ${context === "report" ? "The full report is below." : "Run a scan or open any report to see every issue."}`,
      cls: "border-pass bg-pass-wash",
    },
    unpaid: { text: "Payment is still processing — this page unlocks when it clears. Reload in a minute.", cls: "border-warn bg-warn-wash" },
    expired: { text: "That pass has expired, so the report shows the free summary again.", cls: "border-warn bg-warn-wash" },
    revoked: { text: "That pass was refunded and no longer unlocks reports.", cls: "border-warn bg-warn-wash" },
    invalid: { text: "That unlock link is not valid. If you paid, email support with your receipt and we will sort it out.", cls: "border-fail bg-fail-wash" },
    error: { text: "We could not confirm the payment just now. Reload this page in a minute; if it stays locked, email support.", cls: "border-fail bg-fail-wash" },
  };
  const m = msg[status];
  return (
    <p role="status" className={`no-print mb-5 border-l-2 px-4 py-3 text-ink ${m.cls}`}>
      {m.text}
    </p>
  );
}

/** Small note for pass holders: when it ends and the reusable unlock link for another device. */
export function PassActiveNote({ name, expiresAt, unlockPath }: { name: string; expiresAt: string; unlockPath: string }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 border border-rule bg-sheet px-4 py-3 text-sm">
      <p className="text-ink-soft">
        <span className="font-medium text-ink">{name}</span> pass active until <span className="num">{fmt(expiresAt)}</span>. Use this link to
        unlock on another device; keep it private.
      </p>
      <CopyLink path={unlockPath} label="Copy unlock link" />
    </div>
  );
}
