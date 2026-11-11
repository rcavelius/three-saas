import type { Metadata } from "next";
import { LegalDraft } from "@/components/LegalDraft";

export const metadata: Metadata = { title: "Privacy (draft)" };

export default function Privacy() {
  return (
    <LegalDraft title="Privacy" updated="2026-11-11">
      <h2>The short version</h2>
      <p>
        DataPolish cleans your files inside your web browser. The files you open, their contents and the cleaned results are never sent to us or to anyone else. We do
        not run analytics or advertising trackers.
      </p>
      <h2>How your files are handled</h2>
      <ul>
        <li>When you choose or drop a file, your browser reads it from your disk into the page&rsquo;s memory.</li>
        <li>Parsing and cleaning run in a background thread of the page (a Web Worker) on your computer.</li>
        <li>Downloads are created in your browser and saved straight to your computer.</li>
        <li>When you close or reload the tab, the file and results are gone from memory. We keep no copy because we never receive one.</li>
      </ul>
      <p>
        This is also enforced technically: the site sends a Content-Security-Policy header with <code>connect-src &apos;self&apos;</code>, which tells your browser to
        block the page from sending data to any other server. You can check this yourself in your browser&rsquo;s developer tools (Network tab): opening and cleaning a file
        makes no network requests containing its data.
      </p>
      <h2>What is stored on your device</h2>
      <p>
        If you save a workflow (a list of cleaning steps), it is stored in your browser&rsquo;s local storage on this device. Workflows contain step settings such as column
        names and find &amp; replace text, not your data. You can delete them at any time from the Saved workflows panel or by clearing site data.
      </p>
      <h2>What our servers see</h2>
      <p>
        Like any website, the server that delivers the pages receives standard request information (IP address, browser user agent, the page requested) and may keep it in
        short-lived server logs for security and reliability. Fonts are served from our own domain, not from a third-party font service.
      </p>
      <h2>Future accounts</h2>
      <p>
        Paid plans will add an account to sync workflows. When that launches, this policy will be updated to describe what account data is stored, where, and for how
        long, before any account data is collected.
      </p>
      <h2>Contact</h2>
      <p>Contact details will be added before publication.</p>
    </LegalDraft>
  );
}
