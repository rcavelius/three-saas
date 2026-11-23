import type { LegalInfo } from "@/lib/legal";

/** "Who we are" block shared by the terms and privacy pages. Placeholders only show on the unpublished draft. */
export function OperatorDetails({ legal }: { legal: LegalInfo }) {
  return (
    <p>
      ChangeKite is operated by {legal.entity ?? "[legal entity — to be added before publication]"}
      {legal.address ? `, ${legal.address}` : " [business address — to be added before publication]"}. Contact:{" "}
      <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>. Abuse reports: <a href={`mailto:${legal.abuseEmail}`}>{legal.abuseEmail}</a>.
    </p>
  );
}

/** Eyebrow line: the effective date once published, the draft date before. */
export function legalEyebrow(kind: string, legal: LegalInfo, updated: string): string {
  return legal.published ? `${kind} · effective ${legal.effective ?? updated}` : `${kind} · draft dated ${updated}`;
}
