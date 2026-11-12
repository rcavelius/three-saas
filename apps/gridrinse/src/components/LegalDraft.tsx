import type { ReactNode } from "react";
import type { LegalInfo } from "@/lib/legal";

/** Legal page shell: a draft banner until the operator details are set and the owner approved the text. */
export function LegalDraft({ title, updated, legal, children }: { title: string; updated: string; legal?: LegalInfo; children: ReactNode }) {
  const published = legal?.published ?? false;
  return (
    <article className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">
      {!published && (
        <div role="note" className="border border-mark-edge bg-mark px-4 py-3 text-sm">
          <strong className="font-semibold">Draft — requires legal review before publication.</strong> This text describes how the product works today but has not been
          reviewed by a lawyer and is not yet a binding policy.
        </div>
      )}
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 font-mono text-xs text-ink-3">{published ? `Effective ${legal?.effective ?? updated}` : `Draft dated ${updated}`}</p>
      <div className="prose-doc mt-4">{children}</div>
    </article>
  );
}

/** "Who we are" block shared by the terms and privacy pages. */
export function OperatorDetails({ legal }: { legal: LegalInfo }) {
  return (
    <p>
      GridRinse is operated by {legal.entity ?? "[legal entity — to be added before publication]"}
      {legal.address ? `, ${legal.address}` : " [business address — to be added before publication]"}. Contact:{" "}
      <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>. Abuse reports: <a href={`mailto:${legal.abuseEmail}`}>{legal.abuseEmail}</a>.
    </p>
  );
}
