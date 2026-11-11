import type { Metadata } from "next";
import { LegalDraft } from "@/components/LegalDraft";

export const metadata: Metadata = { title: "Privacy policy (draft)", robots: { index: false } };

export default function PrivacyPage() {
  return (
    <LegalDraft title="Privacy policy" updated="November 2026">
      <h2>What WebhookTrail stores</h2>
      <ul>
        <li>
          <strong>Captured requests.</strong> Everything sent to a capture URL: method, path, query string, headers, body (up to the
          stored limit), body size, content type, the sender&apos;s IP address and the time received. Senders may include personal data or
          credentials in these requests; WebhookTrail stores them as received so you can inspect them.
        </li>
        <li>
          <strong>Endpoints.</strong> Name, creation and expiry time, request counters and your custom response settings.
        </li>
        <li>
          <strong>Owner token.</strong> A random token in a cookie identifies the browser that created an endpoint. We store only a
          SHA-256 hash of it.
        </li>
        <li>
          <strong>Rate-limit counters.</strong> Keyed by IP address or endpoint, kept for at most about a day.
        </li>
      </ul>

      <h2>Retention</h2>
      <p>
        Endpoints expire 24 hours after creation unless you change the expiry (at most 7 days after creation). Expired and deleted
        endpoints are permanently deleted together with their requests by a scheduled cleanup job. Only the newest 100 requests per free
        endpoint are kept. You can delete single requests, all requests or the endpoint at any time.
      </p>

      <h2>Logs</h2>
      <p>
        Server logs record operational events (for example &ldquo;request captured&rdquo;, endpoint id, method and size). Request headers,
        query strings and bodies are not written to logs, and known secret patterns are redacted.
      </p>

      <h2>Cookies</h2>
      <p>
        WebhookTrail sets one strictly necessary cookie, <code>wt_owner</code>, to let you access the endpoints you created. There are no
        analytics, advertising or third-party cookies.
      </p>

      <h2>Sharing</h2>
      <p>We do not sell or share captured data. It is processed only to provide the service. [Hosting and sub-processor list to be added.]</p>

      <h2>Your rights and contact</h2>
      <p>[Controller identity, contact address, legal bases and data-subject rights to be completed after legal review.]</p>
    </LegalDraft>
  );
}
