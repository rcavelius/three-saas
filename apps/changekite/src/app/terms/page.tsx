import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { OperatorDetails, legalEyebrow } from "@/components/OperatorDetails";
import { legalInfo } from "@/lib/legal";

export const dynamic = "force-dynamic";

const UPDATED = "2026-11-23";

export function generateMetadata(): Metadata {
  const published = legalInfo().published;
  return {
    title: published ? "Terms of use" : "Terms (draft)",
    description: "The terms for using ChangeKite: acceptable scanning, paid plans, cancellation, the 14-day refund promise and who runs the service.",
    robots: published ? undefined : { index: false },
    alternates: { canonical: "/terms" },
  };
}

export default function TermsPage() {
  const legal = legalInfo();
  return (
    <DocPage eyebrow={legalEyebrow("Terms of use", legal, UPDATED)} title="Terms of use" draft={!legal.published}>
      <h2>1. The service</h2>
      <p>
        ChangeKite requests public pages of a website you name and produces a report about them. On a paid plan it re-scans the sites you add on a
        schedule and emails you when something meaningful changes. Reports describe what the server returned at the time of the scan and may be
        incomplete or wrong; they are not legal, security or SEO guarantees. The free scan is provided without an account, within the limits shown on
        the pricing page.
      </p>

      <h2>2. Acceptable use</h2>
      <ul>
        <li>Only scan websites you own or are allowed to test, or public sites in a way their robots.txt permits.</li>
        <li>Do not use ChangeKite to overload, probe or attack any system, or try to make it reach private networks.</li>
        <li>Do not try to get around rate limits, plan limits or other technical restrictions, by automated means or otherwise.</li>
      </ul>
      <p>We may block addresses, accounts or targets that break these rules. Site owners can block or slow our crawler as described on the ChangeKiteBot page.</p>

      <h2>3. Reports and links</h2>
      <p>
        Free report links are unguessable but not secret once shared; you are responsible for who you share them with. Reports of monitored sites are
        visible to members of your workspace. The service is provided &ldquo;as is&rdquo;, without warranties that a report is complete or fit for a
        particular purpose; check important findings yourself before relying on them.
      </p>

      <h2>4. Paid plans</h2>
      <p>
        Paid plans are monthly subscriptions billed in advance through Stripe, our payment processor; we never see or store your full card details. A
        subscription renews automatically each month until you cancel. You can upgrade, downgrade or cancel at any time from your account&apos;s billing
        page: upgrades take effect immediately with a prorated charge, and after a cancellation your paid features stay active until the end of the
        period you have already paid for, then your workspace moves to the free plan. Monitored sites above the free plan&apos;s limit are paused, not
        deleted. If a payment fails we email you and keep your paid features for 7 days while Stripe retries; if payment still fails, the workspace moves
        to the free plan and nothing is deleted. Taxes may apply where required. We will give at least 30 days&apos; notice by email before changing the
        price of a plan you are subscribed to.
      </p>

      <h2>5. Cancellation and refunds</h2>
      <p>
        You can cancel at any time from Account &rarr; Plan &amp; billing &rarr; Manage subscription; no email or call is needed. Cancellation takes
        effect at the end of the period you have paid for, and you keep paid features until then; you are not charged again. We do not pro-rate partial
        months after a cancellation. If you were charged in error, or the service did not work for you in your first 14 days of a paid plan, email{" "}
        <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a> within 14 days of the charge and a person will refund it in full. Other refund
        requests are reviewed individually. Refunds go back to the original payment method through Stripe. Deleting your account cancels the
        subscriptions of workspaces you own alone immediately.
      </p>

      <h2>6. Changes</h2>
      <p>These terms may change. Material changes will be announced on this page with a new date, and by email to paying customers at least 30 days in advance.</p>

      <h2>7. Who we are, contact and governing law</h2>
      <OperatorDetails legal={legal} />
      <p>These terms are governed by the laws of {legal.jurisdiction ?? "[jurisdiction — to be added before publication]"}.</p>
    </DocPage>
  );
}
