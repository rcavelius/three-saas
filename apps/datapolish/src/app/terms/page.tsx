import type { Metadata } from "next";
import { LegalDraft } from "@/components/LegalDraft";

export const metadata: Metadata = { title: "Terms (draft)" };

export default function Terms() {
  return (
    <LegalDraft title="Terms of use" updated="2026-11-11">
      <h2>1. The service</h2>
      <p>
        DataPolish is a web page that cleans CSV and spreadsheet files in your browser. The free plan is provided without an account, within the limits shown on the
        pricing page.
      </p>
      <h2>2. Your data</h2>
      <p>
        Your files stay on your device and remain yours. Because processing happens locally, you are responsible for keeping your own copies. Always keep the original file;
        DataPolish never changes it, and the &ldquo;Download original&rdquo; button returns the exact bytes you loaded.
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
      <h2>6. Changes</h2>
      <p>These terms may change. Material changes will be announced on this page with a new date.</p>
      <h2>7. Contact and governing law</h2>
      <p>To be completed during legal review.</p>
    </LegalDraft>
  );
}
