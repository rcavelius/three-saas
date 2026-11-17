import type { ReactNode } from "react";
import { PageHero } from "@/components/PageHero";
import type { LegalInfo } from "@/lib/legal";

/** Legal page shell: a draft banner until the operator details are set and the owner approved the text. */
export function LegalDraft({ title, updated, legal, children }: { title: string; updated: string; legal?: LegalInfo; children: ReactNode }) {
  const published = legal?.published ?? false;
  return (
    <article>
      <PageHero narrow eyebrow={published ? `Effective ${legal?.effective ?? updated}` : `Draft dated ${updated}`} title={title} />
      <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-8 sm:py-14">
      {!published && (
        <div role="note" className="card-pop mb-8 bg-lemon-soft px-4 py-3 text-[15px]">
          <strong className="font-semibold">Draft — requires legal review before publication.</strong> This text describes how the product works today but has not been
          reviewed by a lawyer and is not yet a binding policy.
        </div>
      )}
      <div className="prose-doc card-pop px-5 py-4 text-[16px] sm:px-8 sm:py-6">{children}</div>
      </div>
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
