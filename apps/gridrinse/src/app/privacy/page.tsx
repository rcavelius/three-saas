import type { Metadata } from "next";
import { LegalDraft, OperatorDetails } from "@/components/LegalDraft";
import { legalInfo } from "@/lib/legal";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const published = legalInfo().published;
  return { title: published ? "Privacy policy" : "Privacy (draft)", robots: published ? undefined : { index: false }, alternates: { canonical: "/privacy" } };
}

export default function Privacy() {
  const legal = legalInfo();
  return (
    <LegalDraft title="Privacy" updated="2026-11-12" legal={legal}>
      <h2>The short version</h2>
      <p>
        GridRinse cleans your files inside your web browser. The files you open, their contents, their names and the cleaned results are never sent to us or to anyone
        else, whether or not you have an account. We do not use advertising trackers or third-party analytics scripts; our own first-party usage counting sets no cookies; it keeps a random anonymous ID in your browser's local storage, which you can clear at any time.
      </p>
      <h2>How your files are handled</h2>
      <ul>
        <li>When you choose or drop a file, your browser reads it from your disk into the page&rsquo;s memory.</li>
        <li>Parsing and cleaning run in a background thread of the page (a Web Worker) on your computer.</li>
        <li>Downloads, including ZIP files for batches, are created in your browser and saved straight to your computer.</li>
        <li>When you close or reload the tab, the file and results are gone from memory. We keep no copy because we never receive one.</li>
      </ul>
      <p>
        This is also enforced technically: the site sends a Content-Security-Policy header with <code>connect-src &apos;self&apos;</code>, which tells your browser to
        block the page from sending data to any other server. Our own server has no endpoint that accepts files. You can check this in your browser&rsquo;s developer tools
        (Network tab): opening and cleaning a file makes no request containing its data.
      </p>
      <h2>Accounts (optional)</h2>
      <p>If you create an account, we store:</p>
      <ul>
        <li>your name, email address and a hash of your password (never the password itself);</li>
        <li>active sign-in sessions, with the IP address and browser description of each, so you can review and sign out devices;</li>
        <li>your workspace, its members and invitations;</li>
        <li>
          saved workflows: the list of cleaning steps. Steps contain the settings you typed, such as column names and find &amp; replace text, stored as typed. Find &amp;
          replace values are limited to 1 KB so that workflows cannot be used to store cell data;
        </li>
        <li>billing status (plan, Stripe customer and subscription ids). Card details are handled by Stripe and never reach us.</li>
      </ul>
      <p>
        Deleting your account (Account → Delete account) immediately removes your login, sessions and profile, the workspaces you own alone and every workflow saved in
        them, and cancels their subscriptions.
      </p>
      <h2>Usage statistics</h2>
      <p>
        We count page views and feature use with our own first-party counter (no cookies, no third parties). An event records the page path (without query string) and
        a few fixed values such as &ldquo;batch mode, 3 files, ZIP download&rdquo;. It never includes file names, column names or cell contents, and we do not store your IP
        address with it. Events are kept for 13 months; deleting your account unlinks them from you.
      </p>
      <h2>What is stored on your device</h2>
      <p>
        Workflows you save &ldquo;in this browser&rdquo; live in your browser&rsquo;s local storage, together with a random identifier for the usage counter. If you sign in,
        a session cookie keeps you signed in. You can clear all of it from your browser&rsquo;s site data settings.
      </p>
      <h2>What our servers see</h2>
      <p>
        Like any website, the server that delivers the pages receives standard request information (IP address, browser user agent, the page requested) and may keep it in
        short-lived logs for security and reliability. Fonts are served from our own domain.
      </p>
      <h2>Contact</h2>
      <p>Contact details will be added before publication.</p>
      <h2>Service providers</h2>
      <ul>
        <li>Cloudflare (hosting, security filtering, transactional email delivery): processes the technical data of each request, such as IP address and browser type, and may record anonymous page-load timings (no cookies, no file data).</li>
        <li>Neon (database hosting): stores account, billing-status and support data.</li>
        <li>Stripe (payments): processes card and billing details for paid plans under its own privacy policy.</li>
      </ul>
      <p>None of them receive the files you clean.</p>
      <h2>Who is responsible</h2>
      <OperatorDetails legal={legal} />
    </LegalDraft>
  );
}
