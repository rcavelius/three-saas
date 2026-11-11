export function DocPage({
  eyebrow,
  title,
  lede,
  draft,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  draft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
      {draft && (
        <p role="note" className="mt-6 border-l-2 border-warn bg-warn-wash px-4 py-3 font-medium text-ink">
          Draft &mdash; requires legal review before publication.
        </p>
      )}
      {lede && <p className="mt-6 text-lg leading-relaxed text-ink-soft">{lede}</p>}
      <div className="prose-doc mt-6">{children}</div>
    </div>
  );
}
