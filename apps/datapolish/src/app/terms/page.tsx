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
      <p>Paid plans are not on sale yet. Terms for subscriptions, billing and cancellation will be added before any payment is taken.</p>
      <h2>6. Changes</h2>
      <p>These terms may change. Material changes will be announced on this page with a new date.</p>
      <h2>7. Contact and governing law</h2>
      <p>To be completed during legal review.</p>
    </LegalDraft>
  );
}
