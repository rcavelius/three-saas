import type { ReactNode } from "react";

export function LegalDraft({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
      <div role="note" className="border border-mark-edge bg-mark px-4 py-3 text-sm">
        <strong className="font-semibold">Draft — requires legal review before publication.</strong> This text describes how the product works today but has not been
        reviewed by a lawyer and is not yet a binding policy.
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 font-mono text-xs text-ink-3">Draft dated {updated}</p>
      <div className="prose-doc mt-4">{children}</div>
    </article>
  );
}
