import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraft, OperatorDetails } from "@/components/LegalDraft";
import { legalInfo } from "@/lib/legal";
import { passOffer } from "@/lib/pass";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const published = legalInfo().published;
  return {
    title: published ? "Terms of service" : "Terms of service (draft)",
    robots: published ? undefined : { index: false },
    alternates: { canonical: "/terms" },
  };
}

export default function TermsPage() {
  const legal = legalInfo();
  const offer = passOffer();
  return (
    <LegalDraft title="Terms of service" updated="2026-11-23" legal={legal}>
      <h2>1. The service</h2>
      <p>
        WebhookTrail provides capture URLs that record the HTTP requests sent to them, a console and API to inspect those requests, custom
        responses, and, on paid plans or with a one-time pass, replay of captured requests to destinations you have verified. The Free plan can be used without an
        account, within the limits shown on the <Link href="/pricing">pricing page</Link>.
      </p>

      <h2>2. Acceptable use</h2>
      <ul>
        <li>Use capture URLs for testing and debugging integrations you are entitled to test.</li>
        <li>
          Do not use WebhookTrail to collect credentials or personal data from people who have not agreed to it, to host or distribute
          content, to run phishing or malware campaigns, or to attack third parties.
        </li>
        <li>Do not try to circumvent rate limits, size limits, plan limits or ownership checks, or disrupt the service.</li>
        <li>Only add replay destinations you control or are allowed to send requests to.</li>
      </ul>
      <p>
        We may suspend endpoints or accounts that break these rules. Report abuse to <a href={`mailto:${legal.abuseEmail}`}>{legal.abuseEmail}</a>.
      </p>

      <h2>3. Your data</h2>
      <p>
        What is sent to your endpoints remains yours, and you are responsible for it. Avoid sending production secrets or real personal data;
        if you do, delete them when you are done. Captured requests are deleted when they pass your plan&apos;s history period, when an
        endpoint expires or is deleted, or when you delete them. WebhookTrail is a testing tool, not a backup: keep your own copy of anything
        you need. How we handle data is described in the <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>4. Availability and liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, including fitness for a
        particular purpose. There is no uptime guarantee. Requests can be rejected (for example <code>413</code> or <code>429</code> when a limit
        is reached) or lost, and replays can fail. You are responsible for checking results before relying on them in production.
      </p>

      <h2>5. Paid plans</h2>
      <p>
        Paid plans are monthly subscriptions in US dollars, billed in advance through Stripe, our payment processor; we never see or store your
        full card details. Taxes may be added where they apply. A subscription renews automatically each month until you cancel. Billing
        belongs to a workspace and only its owner can change it. You can upgrade, downgrade or cancel at any time from the billing page of your
        account: upgrades take effect immediately with a prorated charge, and after a cancellation your paid features stay active until the end
        of the period you have already paid for, then your workspace moves to the Free plan. If a payment fails we email you and keep your paid
        features for 7 days while Stripe retries; if payment still fails, the workspace moves to the Free plan. Endpoints over the Free limit
        are then paused, not deleted, and captured requests older than the Free history period are removed by the normal cleanup. We will give
        at least 30 days&apos; notice by email before changing the price of a plan you are subscribed to.
      </p>

      <h2>6. Cancellation and refunds</h2>
      <p>
        You can cancel at any time from Account &rarr; Billing &rarr; Manage subscription; no email or call is needed. Cancellation takes effect at
        the end of the period you have paid for, and you keep paid features until then; you are not charged again. We do not pro-rate partial
        months after a cancellation. If you were charged in error, or the service did not work for you in your first 14 days of a paid plan,
        email {legal.supportEmail} within 14 days of the charge and a person will refund it in full. Other refund requests are reviewed
        individually. Refunds go back to the original payment method through Stripe.
      </p>

      <h2>7. One-time passes</h2>
      <p>
        A pass (for example the {offer.name}, {offer.price}) is a single payment in US dollars through Stripe. It is charged once and never
        renews. It unlocks the features and limits described on the <Link href="/pricing">pricing page</Link> from the moment the payment is
        confirmed, and access ends at the stated time ({offer.durationLabel} later); your endpoints then fall back to your plan&apos;s limits as
        described in section 5. No account is needed to buy a pass. It works in the browser that bought it, in any browser where you open its
        unlock link, and, if you bought it while signed in, for that workspace. Replay still only goes to destinations a workspace has verified.
      </p>
      <p>
        If a pass did not unlock what the pricing page describes, email {legal.supportEmail} within 7 days of purchase for a full refund; a refunded
        pass stops working.
      </p>

      <h2>8. Changes</h2>
      <p>
        These terms may change. Material changes will be announced on this page with a new date, and by email to paying customers at least 30
        days in advance.
      </p>

      <h2>9. Who we are, contact and governing law</h2>
      <OperatorDetails legal={legal} />
      <p>These terms are governed by the laws of {legal.jurisdiction ?? "[jurisdiction — to be added before publication]"}.</p>
    </LegalDraft>
  );
}
