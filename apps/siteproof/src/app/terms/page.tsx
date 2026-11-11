import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Terms (draft)", robots: { index: false } };

export default function TermsPage() {
  return (
    <DocPage eyebrow="Terms of use" title="Terms" draft lede="Plain-language draft terms for the free scanner. They must be reviewed by a lawyer and completed before publication.">
      <h2>The service</h2>
      <p>
        SiteProof requests public pages of a website you name and produces a report about them. Reports describe what the
        server returned at the time of the scan and may be incomplete or wrong; they are not legal, security or SEO
        guarantees.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Only scan websites you own or are allowed to test, or public sites in a way their robots.txt permits.</li>
        <li>Do not use SiteProof to overload, probe or attack any system, or try to make it reach private networks.</li>
        <li>Do not try to get around rate limits or other technical restrictions.</li>
      </ul>
      <p>We may block addresses or targets that break these rules.</p>

      <h2>Reports and links</h2>
      <p>Report links are unguessable but not secret once shared. You are responsible for who you share them with.</p>

      <h2>Paid plans</h2>
      <p>Paid plans are not available yet. Terms for subscriptions, billing and cancellation will be added before launch.</p>

      <h2>Liability</h2>
      <p>[Disclaimer and limitation of liability to be drafted for the operator's jurisdiction.]</p>

      <h2>Contact</h2>
      <p>[Operator contact details to be added.]</p>
    </DocPage>
  );
}
