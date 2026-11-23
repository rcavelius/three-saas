import type { ReactNode } from "react";
import type { LegalInfo } from "@/lib/legal";

/** Legal page shell: a draft banner until the operator details are set and the owner approved the text. */
export function LegalDraft({ title, updated, legal, children }: { title: string; updated: string; legal?: LegalInfo; children: ReactNode }) {
  const published = legal?.published ?? false;
  return (
    <div className="mx-auto w-full max-w-[78ch] px-4 py-12">
      {!published && (
        <div role="note" className="mb-8 border border-warn/50 bg-warn/5 rounded-[4px] px-4 py-3 text-[13.5px] text-warn">
          <strong>Draft — requires legal review before publication.</strong> This text describes how the product works today but has not been
          reviewed by a lawyer and is not yet a binding policy.
        </div>
      )}
      <article className="prose-doc">
        <h1 className="wt-display text-[36px] md:text-[52px]">{title}</h1>
        <p className="font-mono text-[12px] !text-fg-dim">{published ? `Effective ${legal?.effective ?? updated}` : `Draft dated ${updated}`}</p>
        {children}
      </article>
    </div>
  );
}

/** "Who we are" block shared by the terms and privacy pages. */
export function OperatorDetails({ legal }: { legal: LegalInfo }) {
  return (
    <p>
      WebhookTrail is operated by {legal.entity ?? "[legal entity — to be added before publication]"}
      {legal.address ? `, ${legal.address}` : " [business address — to be added before publication]"}. Contact:{" "}
      <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>. Abuse reports: <a href={`mailto:${legal.abuseEmail}`}>{legal.abuseEmail}</a>.
    </p>
  );
}
