import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";
import { FREE_LIMITS } from "@/lib/scanner/scan";
import { botUserAgent } from "@/lib/scanner/deps";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "ChangeKiteBot",
  description: "What ChangeKiteBot is, how it behaves, and how to block or slow it.",
  alternates: { canonical: "/bot" },
};

export default function BotPage() {
  return (
    <DocPage
      eyebrow="The crawler"
      title="ChangeKiteBot"
      lede="If you found ChangeKiteBot in your logs, someone used ChangeKite to inspect your site. Here is exactly what it does."
    >
      <h2>How to recognise it</h2>
      <p>
        Every request carries the user agent <code>{botUserAgent(env().APP_URL)}</code>, pointing to this page. It does not
        pretend to be a browser.
      </p>

      <h2>What it does</h2>
      <ul>
        <li>Starts at the address a person typed in and follows links on the same site only.</li>
        <li>
          Reads at most {FREE_LIMITS.maxPages} pages, {FREE_LIMITS.maxDepth} clicks deep, per scan, with no more than {FREE_LIMITS.concurrency}{" "}
          requests at a time and a {FREE_LIMITS.delayMs} ms pause after each one.
        </li>
        <li>
          Sends a light HEAD request (GET if HEAD is not supported) to check linked URLs it does not crawl, and to up to{" "}
          {FREE_LIMITS.maxExternalLinks} links pointing to other sites.
        </li>
        <li>Reads robots.txt, your XML sitemap and your TLS certificate.</li>
        <li>Stops after about {Math.round(FREE_LIMITS.timeBudgetMs / 1000)} seconds, whatever it has reached.</li>
      </ul>

      <h2>What it never does</h2>
      <ul>
        <li>Submit forms, log in, send cookies or run JavaScript.</li>
        <li>Use any method other than GET and HEAD.</li>
        <li>Request private, local or internal network addresses, even when a link or redirect points there.</li>
        <li>Download more than a few megabytes from any single URL.</li>
      </ul>
      <p>
        The same site can be scanned only a limited number of times per hour, no matter who asks, so ChangeKite cannot be
        used to flood a server.
      </p>

      <h2>Blocking or slowing it</h2>
      <p>ChangeKiteBot obeys robots.txt. To keep it away from your whole site:</p>
      <p>
        <code>User-agent: ChangeKiteBot</code>
        <br />
        <code>Disallow: /</code>
      </p>
      <p>
        It follows the most specific group that names it, otherwise the <code>*</code> group. A <code>Crawl-delay</code> is
        honoured up to 5 seconds, and the crawler then makes one request at a time.
      </p>
    </DocPage>
  );
}
