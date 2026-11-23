import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "../GuideShell";
import { GUIDES } from "../guides";

const guide = GUIDES.find((g) => g.slug === "verify-slack-request-signatures")!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guides/${guide.slug}` },
  openGraph: { title: guide.title, description: guide.description, type: "article" },
};

const STEPS = [
  "Read the raw request body before any parsing (slash commands are form-encoded, events are JSON).",
  "Read the X-Slack-Request-Timestamp header and reject requests whose timestamp is more than a few minutes old.",
  "Build the base string v0:{timestamp}:{raw body} and compute its hex HMAC-SHA256 with your app's signing secret.",
  "Compare v0= plus that hex digest with the X-Slack-Signature header in constant time; reject on mismatch.",
];

export default function Page() {
  return (
    <GuideShell guide={guide} steps={STEPS}>
      <p>
        This guide follows Slack&apos;s public documentation on verifying requests; check it for the current details. Slack sends two headers
        with Events API calls and slash commands: <code>X-Slack-Request-Timestamp</code> and <code>X-Slack-Signature</code>. The signature is{" "}
        <code>v0=</code> followed by the hex HMAC-SHA256 of the string <code>v0:timestamp:body</code>, keyed with your app&apos;s signing secret.
        Because the timestamp is part of what is signed, a captured request cannot simply be reused later if you also reject old timestamps.
      </p>
      <h2>Steps</h2>
      <ol>
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <pre>
        <code>{`import { createHmac, timingSafeEqual } from "node:crypto";

function verifySlack(rawBody: string, timestamp: string | undefined, signature: string | undefined, secret: string): boolean {
  if (!timestamp || !signature) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) return false;
  const expected = "v0=" + createHmac("sha256", secret).update(\`v0:\${timestamp}:\${rawBody}\`).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}`}</code>
      </pre>
      <h2>Why verification fails</h2>
      <ul>
        <li>
          <strong>Parsed body.</strong> A slash command arrives as <code>application/x-www-form-urlencoded</code>. If your framework parses it and you
          rebuild the string, the bytes differ and the HMAC will not match. Sign the raw text.
        </li>
        <li>
          <strong>Wrong secret.</strong> Use the signing secret from your app&apos;s Basic Information page, not a bot token or verification token.
        </li>
        <li>
          <strong>Stale timestamp.</strong> A request replayed minutes later fails the age check by design.
        </li>
      </ul>
      <h2>Inspecting a real request</h2>
      <p>
        Point a slash command at a <Link href="/">WebhookTrail endpoint</Link> and run it: the inspector shows every header, with the signature masked
        until you reveal it, and the body unchanged as raw text or hex, which is what you need to compute the base string by hand. WebhookTrail does
        not check Slack signatures for you. See <Link href="/tools/slack-webhook-tester">the Slack webhook tester</Link> for what it can and cannot do
        (its responses are static, so it will not pass Slack&apos;s URL verification challenge for Events API subscriptions).
      </p>
      <p>
        Related: <Link href="/guides/verify-github-webhook-signatures">GitHub signatures</Link>,{" "}
        <Link href="/guides/verify-stripe-webhook-signatures">Stripe signatures</Link> and the general{" "}
        <Link href="/tools/verify-webhook-signature">signature debugging page</Link>.
      </p>
    </GuideShell>
  );
}
