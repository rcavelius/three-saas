import type { Metadata } from "next";
import { LegalDraft, OperatorDetails } from "@/components/LegalDraft";
import { legalInfo } from "@/lib/legal";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const published = legalInfo().published;
  return { title: published ? "Terms of use" : "Terms (draft)", robots: published ? undefined : { index: false }, alternates: { canonical: "/terms" } };
}

export default function Terms() {
  const legal = legalInfo();
  return (
    <LegalDraft title="Terms of use" updated="2026-11-23" legal={legal}>
      <h2>1. The service</h2>
      <p>
        GridRinse is a web page that cleans CSV and spreadsheet files in your browser. The free plan is provided without an account, within the limits shown on the
        pricing page.
      </p>
      <h2>2. Your data</h2>
      <p>
        Your files stay on your device and remain yours. Because processing happens locally, you are responsible for keeping your own copies. Always keep the original file;
        GridRinse never changes it, and the &ldquo;Download original&rdquo; button returns the exact bytes you loaded.
      </p>
      <h2>3. Check the results</h2>
      <p>
        Cleaning steps change data: they remove rows, rewrite dates and numbers, and rename columns. The preview shows every change and every removed row before you
        download. You are responsible for reviewing the result before relying on it. The service is provided &ldquo;as is&rdquo;, without warranties that the output
        is fit for a particular purpose.
      </p>
      <h2>4. Acceptable use</h2>
      <p>Do not attempt to disrupt the website, circumvent plan limits by automated means, or use the service to process data you have no right to process.</p>
      <h2>5. Paid plans</h2>
      <p>Paid plans are monthly subscriptions billed in advance through Stripe, our payment processor; we never see or store your full card details. A subscription renews automatically each month until you cancel. You can upgrade, downgrade or cancel at any time from your account&apos;s billing page: upgrades take effect immediately with a prorated charge, and after a cancellation your paid features stay active until the end of the period you have already paid for, then your account moves to the free plan. If a payment fails we email you and keep your paid features for 7 days while Stripe retries; if payment still fails, the account moves to the free plan and nothing is deleted. Refund requests are reviewed individually by a person; contact support. We will give at least 30 days&apos; notice by email before changing the price of a plan you are subscribed to.</p>
      <h2>6. Cancellation and refunds</h2>
      <p>
        You can cancel at any time from Account &rarr; Billing &rarr; Manage billing; no email or call is needed. Cancellation takes effect at the end of the period
        you have paid for, and you keep paid features until then; you are not charged again. We do not pro-rate partial months after a cancellation. If you were
        charged in error, or the service did not work for you in your first 14 days of a paid plan, email {legal.supportEmail} within 14 days of the charge and a
        person will refund it in full. Other refund requests are reviewed individually. Refunds go back to the original payment method through Stripe.
      </p>
      <h2>7. One-time passes</h2>
      <p>
        A pass (for example the 24-hour pass) is a single payment through Stripe, charged once; it never renews and is not a subscription. It gives the limits
        described on the pricing page from the moment the payment is confirmed, and access ends at the time stated when you buy it. It works in the browser that
        bought it, in another browser through the private unlock link shown while it is active, and for your workspace if you were signed in when you bought it.
        Your files are still processed in your browser and never uploaded. If a pass did not unlock what this page describes, email {legal.supportEmail} within 7
        days of purchase for a full refund; a refunded pass stops working.
      </p>
      <h3>Spreadsheet templates</h3>
      <p>
        A spreadsheet template (or the bundle of all templates) is a digital download bought with a single Stripe payment; it never renews. After payment you
        get a private download link, shown on screen and emailed to you, that works for 30 days; the downloaded files are yours to keep for personal use or use
        in one business, but may not be resold or shared. If a file does not open or does not work as its page describes, email {legal.supportEmail} within 14
        days of purchase and a person will fix it or refund it in full; a refunded order&apos;s download link stops working.
      </p>
      <h2>8. Changes</h2>
      <p>These terms may change. Material changes will be announced on this page with a new date, and by email to paying customers at least 30 days in advance.</p>
      <h2>9. Who we are, contact and governing law</h2>
      <OperatorDetails legal={legal} />
      <p>These terms are governed by the laws of {legal.jurisdiction ?? "[jurisdiction — to be added before publication]"}.</p>
    </LegalDraft>
  );
}
