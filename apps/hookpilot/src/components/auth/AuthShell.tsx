import { Suspense } from "react";

export function AuthShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <p className="label">{eyebrow}</p>
      <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
      {intro && <p className="mt-2 text-[14px] text-fg-muted leading-relaxed">{intro}</p>}
      <div className="mt-8 border border-line rounded-[6px] bg-surface p-5">
        <Suspense fallback={<p className="font-mono text-[12px] text-fg-dim">Loading…</p>}>{children}</Suspense>
      </div>
    </div>
  );
}
