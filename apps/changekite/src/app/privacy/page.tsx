import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Privacy (draft)", robots: { index: false } };

export default function PrivacyPage() {
  return (
    <DocPage eyebrow="Privacy policy" title="Privacy" draft lede="This draft describes what the software in this repository actually does today. It must be reviewed by a lawyer and completed with the operator's legal details before publication.">
      <h2>Who is responsible</h2>
      <p>[Operator name, address and contact email to be added.]</p>

      <h2>What we collect when you run a free scan</h2>
      <ul>
        <li>The website address you enter, and the report we produce from the public pages of that site.</li>
        <li>
          For rate limiting, a one-way hash of your IP address is kept in a counter for the current hour. The scan record
          itself does not store your IP address.
        </li>
        <li>Standard server logs (time, path, status) kept by the hosting provider.</li>
      </ul>
      <p>No account is needed for a free scan, no cookies are set for it, and no third-party analytics or advertising scripts are loaded.</p>

      <h2>Reports</h2>
      <p>
        Each report is stored under a long random link. Anyone who has the link can view the report, so share it with care.
        Reports are deleted automatically after the retention period (90 days by default).
      </p>
      <p>
        Reports contain information that was publicly available on the scanned site at the time of the scan, such as page
        addresses, titles and links.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>Your email address, name and a salted password hash; the workspaces you belong to and your role in them.</li>
        <li>
          Signed-in sessions: a session cookie (httpOnly) and, per session, the time, the browser&rsquo;s user agent and the IP address, so you
          can review and end sessions on the account page.
        </li>
        <li>Monitored site addresses, their scan reports, issue history and alert settings, visible only to members of your workspace.</li>
        <li>
          Emails we send (confirmation, password reset, invitations, alerts, billing notices) are stored in an outbox table with their status.
        </li>
      </ul>
      <p>
        Deleting your account on the account page removes your login, sessions and the workspaces you own alone, with all their sites,
        reports and alerts, immediately.
      </p>

      <h2>Payments</h2>
      <p>
        Card payments are handled by Stripe on its own pages. We store the Stripe customer and subscription identifiers, the plan and its
        status; we never receive card numbers.
      </p>

      <h2>Product analytics</h2>
      <p>
        Page views and a few product events (for example &ldquo;scan run&rdquo; or &ldquo;checkout started&rdquo;) are recorded on our own server
        with a random identifier kept in your browser&rsquo;s local storage and, when signed in, your user id. IP addresses are not stored with
        these events and no third-party analytics are used.
      </p>

      <h2>Why we process this data</h2>
      <p>[Legal basis to be confirmed, e.g. providing the service you requested and preventing abuse.]</p>

      <h2>Your rights</h2>
      <p>[Access, deletion and complaint rights and how to exercise them, to be completed for the jurisdictions served.]</p>

      <h2>Processors</h2>
      <p>[Hosting and database providers to be listed once chosen.] Payments: Stripe. Email delivery: Resend (once configured).</p>
    </DocPage>
  );
}
