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
  /** Legal pages: shows the draft banner until the operator details are set and the text is approved. */
  draft?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display mt-3 text-[2.6rem] sm:text-6xl">{title}</h1>
      {draft && (
        <p role="note" className="mt-6 rounded-xl border-l-4 border-warn bg-warn-wash px-4 py-3 font-medium text-ink">
          Draft &mdash; requires legal review before publication. This text describes how the product works today but is not yet a binding policy.
        </p>
      )}
      {lede && <p className="mt-6 text-lg leading-relaxed text-ink-soft">{lede}</p>}
      <div className="prose-doc mt-6">{children}</div>
    </div>
  );
}
