import type { Metadata } from "next";
import { LegalDraft } from "@/components/LegalDraft";

export const metadata: Metadata = { title: "Terms of service (draft)", robots: { index: false } };

export default function TermsPage() {
  return (
    <LegalDraft title="Terms of service" updated="November 2026">
      <h2>The service</h2>
      <p>
        HookPilot provides URLs that record HTTP requests sent to them and a console to inspect those requests. The Free plan is
        provided without an account, as is, and may change or be limited at any time.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Use capture URLs for testing and debugging integrations you are entitled to test.</li>
        <li>
          Do not use HookPilot to collect credentials or personal data from people who have not agreed to it, to host or distribute
          content, to run phishing or malware campaigns, or to attack third parties.
        </li>
        <li>Do not try to circumvent rate limits, size limits or ownership checks.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        You are responsible for what is sent to your endpoints. Avoid sending production secrets or real personal data; if you do,
        delete them when you are done. Data is deleted when an endpoint expires or is deleted.
      </p>

      <h2>Availability and liability</h2>
      <p>
        There is no uptime guarantee for the Free plan. Requests may be rejected (413, 429) or lost. [Limitation of liability, governing
        law and contact details to be completed after legal review.]
      </p>

      <h2>Paid plans</h2>
      <p>Paid plans are not on sale yet. Terms for them will be added before any payment is taken.</p>
    </LegalDraft>
  );
}
