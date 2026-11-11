export function LegalDraft({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[78ch] px-4 py-12">
      <div role="note" className="border border-warn/50 bg-warn/5 rounded-[4px] px-4 py-3 text-[13.5px] text-warn">
        <strong>Draft — requires legal review before publication.</strong> This text is a working draft, not a binding document.
      </div>
      <article className="prose-doc mt-8">
        <h1 className="text-[30px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="font-mono text-[12px] !text-fg-dim">Draft of {updated}</p>
        {children}
      </article>
    </div>
  );
}
