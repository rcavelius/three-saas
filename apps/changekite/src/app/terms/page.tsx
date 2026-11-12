import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Terms (draft)", robots: { index: false }, alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <DocPage eyebrow="Terms of use" title="Terms" draft lede="Plain-language draft terms for the free scanner. They must be reviewed by a lawyer and completed before publication.">
      <h2>The service</h2>
      <p>
        ChangeKite requests public pages of a website you name and produces a report about them. Reports describe what the
        server returned at the time of the scan and may be incomplete or wrong; they are not legal, security or SEO
        guarantees.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Only scan websites you own or are allowed to test, or public sites in a way their robots.txt permits.</li>
        <li>Do not use ChangeKite to overload, probe or attack any system, or try to make it reach private networks.</li>
        <li>Do not try to get around rate limits or other technical restrictions.</li>
      </ul>
      <p>We may block addresses or targets that break these rules.</p>

      <h2>Reports and links</h2>
      <p>Report links are unguessable but not secret once shared. You are responsible for who you share them with.</p>

      <h2>Paid plans</h2>
      <p>Paid plans are monthly subscriptions billed in advance through Stripe, our payment processor; we never see or store your full card details. A subscription renews automatically each month until you cancel. You can upgrade, downgrade or cancel at any time from your account&apos;s billing page: upgrades take effect immediately with a prorated charge, and after a cancellation your paid features stay active until the end of the period you have already paid for, then your account moves to the free plan. If a payment fails we email you and keep your paid features for 7 days while Stripe retries; if payment still fails, the account moves to the free plan and nothing is deleted. Refund requests are reviewed individually by a person; contact support. We will give at least 30 days&apos; notice by email before changing the price of a plan you are subscribed to.</p>

      <h2>Liability</h2>
      <p>[Disclaimer and limitation of liability to be drafted for the operator's jurisdiction.]</p>

      <h2>Contact</h2>
      <p>[Operator contact details to be added.]</p>
    </DocPage>
  );
}
