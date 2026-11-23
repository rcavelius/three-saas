import { SkyHero } from "./ui";

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
    <>
      <SkyHero title={title} lede={lede} crumb={eyebrow} wide />
      <div className="mx-auto max-w-3xl px-5 pt-14 sm:px-8 sm:pt-20">
      {draft && (
        <p role="note" className="mt-6 rounded-xl border-l-4 border-warn bg-warn-wash px-4 py-3 font-medium text-ink">
          Draft &mdash; requires legal review before publication. This text describes how the product works today but is not yet a binding policy.
        </p>
      )}
      <div className="prose-doc">{children}</div>
      </div>
    </>
  );
}
