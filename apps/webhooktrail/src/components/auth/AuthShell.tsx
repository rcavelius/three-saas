import { Suspense } from "react";

export function AuthShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <p className="label">{eyebrow}</p>
      <h1 className="mt-3 wt-h2 text-[30px] md:text-[34px]">{title}</h1>
      {intro && <p className="mt-2 text-[14px] text-fg-muted leading-relaxed">{intro}</p>}
      <div className="mt-8 rounded-[14px] border border-line bg-surface p-6 shadow-[0_40px_80px_-48px_rgba(0,0,0,0.9)]">
        <Suspense fallback={<p className="font-mono text-[12px] text-fg-dim">Loading…</p>}>{children}</Suspense>
      </div>
    </div>
  );
}
