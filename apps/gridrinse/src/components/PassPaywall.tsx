"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { startCheckout } from "@/components/PlanButton";
import { track } from "@/lib/analytics";
import type { DownloadBlock } from "@/lib/downloadQuota";
import { formatBytes, formatLimit, type PassOffer, type UpgradeOffer } from "@/lib/limits";
import { formatPassTime, startPassCheckout, type PassFrom } from "@/lib/passCheckout";

const usd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/** "Get the 24-hour pass — $5": starts Stripe Checkout for the pass (no account needed). */
export function PassButton({
  pass,
  from,
  label,
  className = "btn-pop !min-h-11 !px-4 !text-[16px]",
  beforeCheckout,
  returnPath,
}: {
  pass: PassOffer;
  from: PassFrom;
  /** Where Stripe sends the buyer back (default: this page). */
  returnPath?: string;
  label?: string;
  className?: string;
  /** Runs before leaving for checkout (e.g. keep the visitor's work in this browser). */
  beforeCheckout?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            await beforeCheckout?.();
          } catch {
            /* keeping the work is best effort; checkout still works */
          }
          const err = await startPassCheckout(pass.passId, from, returnPath);
          if (err) {
            setMsg(err);
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening secure checkout…" : (label ?? `Get the ${pass.name} — ${usd(pass.price)}`)}
      </button>
      {msg && (
        <p role="alert" className="basis-full text-[13px] text-del-ink">
          {msg}
        </p>
      )}
    </>
  );
}

/** "or Pro, $9/month": the existing plan flow (checkout when signed in, sign-up otherwise). */
function ProLink({ offer, from, signedIn }: { offer: UpgradeOffer; from: "download" | "limit" | "files"; signedIn: boolean }) {
  const plan = offer.planId as "pro" | "business";
  const [msg, setMsg] = useState<string | null>(null);
  const text = `or ${offer.planName}, ${usd(offer.priceMonthly)}/month`;
  const cls = "text-[15px] font-bold underline decoration-2 underline-offset-4";
  return signedIn ? (
    <>
      <button
        type="button"
        className={cls}
        onClick={async () => {
          track("upgrade_clicked", { plan, from });
          setMsg(await startCheckout(plan));
        }}
      >
        {text}
      </button>
      {msg && (
        <p role="alert" className="basis-full text-[13px] text-del-ink">
          {msg}
        </p>
      )}
    </>
  ) : (
    <Link href={`/signup?plan=${plan}`} className={cls} onClick={() => track("upgrade_clicked", { plan, from })}>
      {text}
    </Link>
  );
}

/**
 * The download paywall, shown instead of downloading when the cleaned output is over the free allowance.
 * Says exactly what is locked, the one-time pass first (cheapest one-off), Pro second.
 */
export function DownloadPaywall({
  rows,
  reason,
  downloadRows,
  downloadsPerDay,
  pass,
  pro,
  signedIn,
  beforeCheckout,
  onClose,
}: {
  rows: number;
  reason: DownloadBlock;
  downloadRows: number;
  downloadsPerDay: number;
  pass: PassOffer | null;
  pro: UpgradeOffer | null;
  signedIn: boolean;
  beforeCheckout?: () => Promise<void>;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, []);
  const perDay = downloadsPerDay === 1 ? "one a day" : `${formatLimit(downloadsPerDay)} a day`;
  return (
    <section aria-labelledby="paywall-heading" className="rounded-[12px] border-2 border-ink bg-lemon-soft px-4 py-4 shadow-[4px_4px_0_var(--color-ink)] sm:px-5">
      <h3 id="paywall-heading" ref={heading} tabIndex={-1} className="text-[20px] font-extrabold tracking-[-0.01em] outline-none">
        Your cleaned file is ready — {rows.toLocaleString("en-US")} rows.
      </h3>
      <p className="mt-1 text-[15px] font-medium">
        {reason === "download_daily" ? "You have used today's free download. " : ""}Free downloads are up to {formatLimit(downloadRows)} rows ({perDay}).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {pass && <PassButton pass={pass} from="download" label={`Download with a ${pass.name} — ${usd(pass.price)}`} beforeCheckout={beforeCheckout} />}
        {pro && <ProLink offer={pro} from="download" signedIn={signedIn} />}
        {!pass && !pro && (
          <Link href="/pricing" className="text-[15px] font-bold underline decoration-2 underline-offset-4">
            See plans
          </Link>
        )}
      </div>
      {pass && (
        <ul className="mt-3 space-y-1 text-[14px] font-medium">
          <li>
            One-time payment, no subscription, no account needed. Unlimited downloads and files up to {formatBytes(pass.maxFileBytes).replace(/\.0 /, " ")} for {pass.durationHours}{" "}
            hours.
          </li>
          <li>Your file stays in this browser. Files are processed in your browser and never uploaded.</li>
          <li>
            After paying, you&apos;ll come back here. Your cleaning steps are kept, and your file is restored from this browser&apos;s own storage; if it isn&apos;t,
            drop the file again to download.
          </li>
        </ul>
      )}
      <button type="button" className="mt-3 text-[14px] font-bold underline underline-offset-2" onClick={onClose}>
        Not now
      </button>
    </section>
  );
}

/** "24-hour pass active until …" with the buyer's unlock link for another device. */
export function PassActiveNote({ pass }: { pass: { name: string; expiresAt: string; unlockUrl: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="note" className="rounded-lg border-2 border-ink bg-mint-soft px-4 py-3 text-[14px] font-medium">
      <p className="text-[15px] font-extrabold">
        {pass.name.charAt(0).toUpperCase() + pass.name.slice(1)} active until {formatPassTime(pass.expiresAt)}.
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer font-bold underline underline-offset-2">Use this link to unlock on another device</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="pass-unlock-link">
            Unlock link
          </label>
          <input id="pass-unlock-link" readOnly value={pass.unlockUrl} className="field min-h-0 flex-1 py-1 font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(pass.unlockUrl);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-2">Keep it private: anyone with the link can use the pass until it ends.</p>
      </details>
    </div>
  );
}
