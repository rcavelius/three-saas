import type { Metadata } from "next";
import Link from "next/link";
import { formatBytes, PLANS } from "@/lib/limits";

export const metadata: Metadata = { title: "Pricing", description: "Free in the browser. Pro and Business plans for larger files and synced workflows are coming." };

export default function Pricing() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Pricing</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Free to use. Paid plans for bigger jobs.</h1>
      <p className="mt-3 max-w-[62ch] text-ink-2">
        The cleaner is free and needs no account. Pro and Business are planned and not on sale yet: accounts and payments are still being built, so the buttons below only
        let you know when they open.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse border border-rule bg-surface text-sm">
          <caption className="sr-only">Plans and limits</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[22%] border-b border-r border-rule bg-sunken px-4 py-3 text-left text-xs font-semibold text-ink-2">
                Plan
              </th>
              {PLANS.map((p) => (
                <th key={p.id} scope="col" className={`border-b border-r border-rule px-4 py-3 text-left align-top ${p.id === "pro" ? "bg-accent-wash" : "bg-sunken"}`}>
                  <span className="block text-base font-semibold">{p.name}</span>
                  <span className="mt-1 block font-mono text-2xl font-medium">
                    ${p.priceMonthly}
                    <span className="text-sm text-ink-3">/mo</span>
                  </span>
                  <span className="mt-1 block text-xs font-normal text-ink-2">{p.blurb}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {(
              [
                ["File size", (p: (typeof PLANS)[number]) => formatBytes(p.limits.maxFileBytes)],
                ["Rows per file", (p: (typeof PLANS)[number]) => p.limits.maxRows.toLocaleString("en-US")],
                ["Files at once", (p: (typeof PLANS)[number]) => String(p.limits.maxFiles)],
              ] as const
            ).map(([label, fn]) => (
              <tr key={label}>
                <th scope="row" className="border-b border-r border-rule px-4 py-2 text-left font-sans text-xs font-semibold text-ink-2">
                  {label}
                </th>
                {PLANS.map((p) => (
                  <td key={p.id} className="border-b border-r border-rule px-4 py-2 tabular-nums">
                    {fn(p)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="border-b border-r border-rule px-4 py-2 text-left align-top font-sans text-xs font-semibold text-ink-2">
                Includes
              </th>
              {PLANS.map((p) => (
                <td key={p.id} className="border-b border-r border-rule px-4 py-2 align-top font-sans text-[13px] text-ink-2">
                  <ul className="space-y-1">
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-r border-rule px-4 py-3" />
              {PLANS.map((p) => (
                <td key={p.id} className="border-r border-rule px-4 py-3 font-sans">
                  {p.id === "free" ? (
                    <Link href="/" className="btn">
                      Use it now
                    </Link>
                  ) : (
                    <Link href={`/signup?plan=${p.id}`} className={`btn ${p.id === "pro" ? "btn-primary" : ""}`}>
                      Get notified
                    </Link>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] text-ink-3">
        Paid-plan limits are planned and may change before launch. Every plan processes files in your browser; paid plans add an account only to sync workflows and settings,
        not your data.
      </p>
    </div>
  );
}
