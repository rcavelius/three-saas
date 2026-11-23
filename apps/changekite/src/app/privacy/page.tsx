import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { OperatorDetails, legalEyebrow } from "@/components/OperatorDetails";
import { env } from "@/lib/env";
import { legalInfo } from "@/lib/legal";

export const dynamic = "force-dynamic";

const UPDATED = "2026-11-23";

export function generateMetadata(): Metadata {
  const published = legalInfo().published;
  return {
    title: published ? "Privacy policy" : "Privacy (draft)",
    description: "What ChangeKite stores when you scan a site or create an account, who processes it, how long it is kept and how to have it deleted.",
    robots: published ? undefined : { index: false },
    alternates: { canonical: "/privacy" },
  };
}

export default function PrivacyPage() {
  const legal = legalInfo();
  const e = env();
  const assistantOn = Boolean(e.ANTHROPIC_API_KEY);
  return (
    <DocPage eyebrow={legalEyebrow("Privacy policy", legal, UPDATED)} title="Privacy" draft={!legal.published}>
      <h2>Who is responsible</h2>
      <OperatorDetails legal={legal} />

      <h2>What we collect when you run a free scan</h2>
      <ul>
        <li>The website address you enter, and the report we produce from the public pages of that site.</li>
        <li>
          For rate limiting, a one-way hash of your IP address is kept in a counter for the current hour, and the counter is deleted within two days. The
          scan record itself does not store your IP address.
        </li>
        <li>Standard request logs (time, path, status) kept by the hosting provider.</li>
      </ul>
      <p>No account is needed for a free scan, no cookies are set for it, and no third-party analytics or advertising scripts are loaded.</p>

      <h2>Reports</h2>
      <p>
        Each free report is stored under a long random link. Anyone who has the link can view the report, so share it with care. Free reports are deleted
        automatically after {e.REPORT_RETENTION_DAYS} days.
      </p>
      <p>Reports contain information that was publicly available on the scanned site at the time of the scan, such as page addresses, titles and links.</p>

      <h2>Accounts</h2>
      <ul>
        <li>Your email address, name and a salted password hash (never the password itself); the workspaces you belong to and your role in them.</li>
        <li>
          Signed-in sessions: a session cookie (httpOnly) and, per session, the time, the browser&rsquo;s user agent and the IP address, so you can review
          and end sessions on the account page.
        </li>
        <li>Monitored site addresses, their scan reports, issue history and alert settings, visible only to members of your workspace.</li>
        <li>Emails we send (confirmation, password reset, invitations, alerts, billing notices) are stored in an outbox table with their status.</li>
        <li>Support requests you send us, with the messages in each conversation.</li>
      </ul>
      <p>
        Deleting your account on the account page removes your login, sessions and the workspaces you own alone, with all their sites, reports and alerts,
        immediately, and cancels their subscriptions.
      </p>

      <h2>Payments</h2>
      <p>
        Card payments are handled by Stripe on its own pages. We store the Stripe customer and subscription identifiers, the plan and its status; we never
        receive card numbers.
      </p>

      <h2>Product analytics</h2>
      <p>
        Page views and a few product events (for example &ldquo;scan run&rdquo; or &ldquo;checkout started&rdquo;) are recorded on our own server with a
        random identifier kept in your browser&rsquo;s local storage and, when signed in, your user id. IP addresses are not stored with these events and
        no third-party analytics are used.
      </p>

      <h2>Service providers</h2>
      <ul>
        <li>
          Cloudflare (hosting, security filtering, transactional email delivery): processes the technical data of each request, such as IP address and
          browser type, and delivers the emails we send you.
        </li>
        <li>Neon (database hosting): stores account, monitoring, report, billing-status and support data.</li>
        <li>Stripe (payments): processes card and billing details for paid plans under its own privacy policy.</li>
        {assistantOn && (
          <li>Anthropic (support assistant): receives the questions you type into the support assistant, to answer them. It does not receive your reports.</li>
        )}
      </ul>

      <h2>Why we process this data</h2>
      <p>
        We process account, monitoring and billing data to provide the service you signed up for (performance of a contract), and request logs, IP hashes
        and rate limits to keep the service secure and prevent abuse (legitimate interest). Product analytics help us improve the service (legitimate
        interest) and are never shared with third parties. Invoices and payment records are kept by Stripe as tax and accounting law requires.
      </p>

      <h2>Your rights</h2>
      <p>
        You can change your name and password, review your sessions and delete your account on the account page at any time. Depending on where you live, you may
        also have the right to request a copy of your data, to object to or restrict processing, and to complain to your data protection authority. To
        exercise any of these rights, email <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>; a person will answer within 30 days.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a>. Changes to this policy are announced on this page
        with a new date, and by email to account holders when they are material.
      </p>
    </DocPage>
  );
}
