import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraft, OperatorDetails } from "@/components/LegalDraft";
import { legalInfo } from "@/lib/legal";
import { CATALOG, FREE_PLAN, formatBytesShort, formatCount, formatHours, limits, planLimitsFor } from "@/lib/plans";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const published = legalInfo().published;
  return {
    title: published ? "Privacy policy" : "Privacy policy (draft)",
    robots: published ? undefined : { index: false },
    alternates: { canonical: "/privacy" },
  };
}

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

export default function PrivacyPage() {
  const legal = legalInfo();
  const plans = CATALOG.plans.map((p) => planLimitsFor(p.id));
  const free = planLimitsFor(FREE_PLAN.id);
  return (
    <LegalDraft title="Privacy policy" updated="2026-11-23" legal={legal}>
      <h2>The short version</h2>
      <p>
        WebhookTrail stores the HTTP requests sent to your capture URLs so you can inspect them, and deletes them after a limited time. We do
        not sell data, show ads or use third-party analytics or advertising cookies. Payments are handled by Stripe.
      </p>

      <h2>What WebhookTrail stores</h2>
      <ul>
        <li>
          <strong>Captured requests.</strong> Everything sent to a capture URL: method, path, query string, headers, body (up to the
          plan&apos;s stored size: {plans.map((p) => `${formatBytesShort(p.storedBodyBytes)} on ${p.planName}`).join(", ")}), body size,
          content type, the sender&apos;s IP address and the time received. WebhookTrail&apos;s own session, owner and pass cookies are removed from
          stored headers. Senders may include personal data or credentials in these requests; WebhookTrail stores them as received so you can
          inspect them. Secrets are masked in the console by default, but the stored request is unchanged.
        </li>
        <li>
          <strong>Endpoints.</strong> Name, creation and expiry time, request counters and your custom response settings.
        </li>
        <li>
          <strong>Owner token.</strong> If you create an endpoint without an account, a random token in a cookie identifies your browser as its
          owner. We store only a SHA-256 hash of it.
        </li>
        <li>
          <strong>Rate-limit counters.</strong> Keyed by IP address, endpoint or workspace, kept for at most about a day.
        </li>
      </ul>

      <h2>Accounts</h2>
      <p>An account is optional for the Free plan and required for paid plans. If you create one, we store:</p>
      <ul>
        <li>your name, email address and a hash of your password (never the password itself);</li>
        <li>active sign-in sessions, with the IP address and browser description of each, so you can review and sign out devices;</li>
        <li>your workspace, its members, their roles and invitations;</li>
        <li>
          replay destinations (their URLs and verification status) and the replay history: who replayed which request, when, to which
          destination, and the response status and timing;
        </li>
        <li>billing status (plan, Stripe customer and subscription ids). Card details are handled by Stripe and never reach us;</li>
        <li>support requests and support chat messages you send us.</li>
      </ul>
      <p>
        We send account emails (confirming your address, password resets, invitations, billing notices and usage warnings). Deleting your
        account (Account &rarr; Delete account) immediately removes your login, sessions and memberships, the workspaces you own alone with all
        their endpoints, captured requests, destinations and replay history, and cancels their subscriptions. See{" "}
        <Link href="/help/delete-your-account">Deleting your account</Link>.
      </p>

      <h2>Retention</h2>
      <ul>
        <li>
          Free and anonymous endpoints expire {formatHours(free.endpointTtlHours ?? 24)} after creation unless you change the expiry (at most{" "}
          {formatHours(limits.freeMaxLifetimeHours)} after creation). Endpoints on paid plans do not expire.
        </li>
        <li>
          Captured requests are deleted when they are older than the plan&apos;s history period:{" "}
          {plans.map((p) => `${days(p.historyDays)} on ${p.planName}`).join(", ")}.
        </li>
        <li>
          Only the newest requests per endpoint are kept: {plans.map((p) => `${formatCount(p.requestsStored)} on ${p.planName}`).join(", ")}.
        </li>
        <li>
          Expired and deleted endpoints are permanently deleted together with their requests by a scheduled cleanup job, so data can remain for
          a short time after it passes a limit. You can delete single requests, all requests or an endpoint at any time.
        </li>
        <li>When a paid subscription ends, the Free plan&apos;s history period applies to the workspace from then on.</li>
      </ul>

      <h2>Payments</h2>
      <p>
        Paid plans are processed by Stripe. When you subscribe, you enter your payment details on Stripe&apos;s checkout page; Stripe processes
        them under its own privacy policy and tells us only the result (customer and subscription ids, plan and payment status). Invoices and
        payment records stay with Stripe as required for accounting, also after you delete your account.
      </p>

      <h2>Usage statistics</h2>
      <p>
        We count page views and a few product events with our own first-party counter (no cookies, no third parties): page views, sign-up
        started, sign-up completed (email confirmed), endpoint created, upgrade clicked and checkout started, with the chosen plan where it applies. An event records the event
        name, the page path (without query string; anything that looks like an email or IP address is removed), a random anonymous ID kept in
        your browser&apos;s local storage (<code>wt_aid</code>) and, if you are signed in, your user id. We do not store your IP address with
        it, and it never contains captured requests.
      </p>

      <h2>Logs</h2>
      <p>
        Server logs record operational events (for example &ldquo;request captured&rdquo;, endpoint id, method and size). Request headers,
        query strings and bodies are not written to logs, and known secret patterns are redacted. Like any website, our hosting provider
        receives standard request information (IP address, browser user agent, the page requested) and may keep it in short-lived logs for
        security and reliability.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        WebhookTrail sets only strictly necessary cookies: <code>wt_owner</code> (30 days, sent only to our API) lets you access endpoints you
        created without an account, <code>wt_pass</code> (until a one-time pass you bought ends) unlocks that pass in this browser, and
        sign-in session cookies keep you signed in when you have an account. Local storage holds only the
        random usage-counter ID, which you can clear at any time. There are no analytics, advertising or third-party cookies.
      </p>

      <h2>Service providers</h2>
      <ul>
        <li>
          Cloudflare (hosting, security filtering, transactional email delivery): processes the technical data of each request, including
          requests to capture URLs, and the emails we send you.
        </li>
        <li>Neon (database hosting): stores captured requests, endpoints, account, billing-status and support data.</li>
        <li>Stripe (payments): processes card and billing details for paid plans under its own privacy policy.</li>
        <li>
          Anthropic (support assistant, when it is switched on): receives the messages you type into the support chat, the recent conversation
          and your plan name, to draft an answer from our help articles. It does not receive your email address, account ids or captured
          requests.
        </li>
      </ul>
      <p>We do not sell or share captured data. It is processed only to provide the service.</p>

      <h2>Legal basis</h2>
      <p>
        Where the GDPR or similar laws apply, we process account, captured-request, billing and support data to provide the service you asked
        for (performance of a contract), security logs and rate limits for our legitimate interest in keeping the service safe and available,
        anonymous usage statistics for our legitimate interest in improving the product, and payment records to meet legal obligations.
      </p>

      <h2>Your rights</h2>
      <p>
        You can see, export through the inspection API, and delete your captured data and endpoints yourself, and delete your account at any
        time. Depending on where you live, you may also have the right to access, correct, delete or receive a copy of your personal data, to
        object to or restrict its processing, and to complain to your data-protection authority. To make a request, email{" "}
        <a href={`mailto:${legal.supportEmail}`}>{legal.supportEmail}</a> or open a ticket from <Link href="/support">support</Link>; a person
        handles these. If a request sent to someone else&apos;s capture URL contains your data, contact the endpoint&apos;s owner, or us at{" "}
        <a href={`mailto:${legal.abuseEmail}`}>{legal.abuseEmail}</a> if you believe the URL is being misused.
      </p>

      <h2>Changes</h2>
      <p>We will announce material changes to this policy on this page with a new date, and by email to paying customers.</p>

      <h2>Who is responsible and contact</h2>
      <OperatorDetails legal={legal} />
    </LegalDraft>
  );
}
