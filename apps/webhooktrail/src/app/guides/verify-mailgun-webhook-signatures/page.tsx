import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "../GuideShell";
import { GUIDES } from "../guides";

const guide = GUIDES.find((g) => g.slug === "verify-mailgun-webhook-signatures")!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guides/${guide.slug}` },
  openGraph: { title: guide.title, description: guide.description, type: "article" },
};

const STEPS = [
  "Parse the JSON body and read the signature object: timestamp, token and signature.",
  "Concatenate the timestamp and the token (in that order, as strings).",
  "Compute an HMAC-SHA256 of that string using your Mailgun webhook signing key and take the hex digest.",
  "Compare it with the signature value in constant time, and reject the request if it differs (and consider rejecting old timestamps or reused tokens).",
];

export default function Page() {
  return (
    <GuideShell guide={guide} steps={STEPS}>
      <p>
        <Link href="/tools/mailgun-webhook-tester">Test a Mailgun webhook</Link> or{" "}
        <Link href="/tools/send-test-webhook">send a test webhook</Link> first to see a real payload. This guide follows Mailgun&apos;s public
        documentation on securing webhooks; check it for the current details, and prefer Mailgun&apos;s own guidance in production. Unlike many
        providers, Mailgun puts the signature inside the JSON body, in a <code>signature</code> object with <code>timestamp</code>,{" "}
        <code>token</code> and <code>signature</code> fields, rather than in a request header. It is an HMAC-SHA256, keyed with your webhook signing
        key, over the timestamp followed directly by the token.
      </p>
      <h2>Steps</h2>
      <ol>
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <pre>
        <code>{`import { createHmac, timingSafeEqual } from "node:crypto";

// body: the parsed JSON, e.g. { signature: { timestamp, token, signature }, "event-data": { ... } }
function verifyMailgun(body: any, signingKey: string): boolean {
  const { timestamp, token, signature } = body?.signature ?? {};
  if (!timestamp || !token || !signature) return false;
  const expected = createHmac("sha256", signingKey).update(String(timestamp) + String(token)).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}`}</code>
      </pre>
      <h2>Why verification fails</h2>
      <ul>
        <li>
          <strong>Wrong key.</strong> Use the webhook signing key from your Mailgun account, not an ordinary sending API key.
        </li>
        <li>
          <strong>Wrong order or format.</strong> The signed string is the timestamp immediately followed by the token, with nothing between them.
        </li>
        <li>
          <strong>Looking in the headers.</strong> The values are in the JSON body, so a handler that only reads headers will never find them.
        </li>
        <li>
          <strong>Digest encoding.</strong> Compare hex to hex; do not base64-encode the digest.
        </li>
        <li>
          <strong>Replays.</strong> A valid signature can be sent again. Check that the timestamp is recent and that you have not seen the token before.
        </li>
      </ul>
      <h2>Inspecting a real request</h2>
      <p>
        Add a <Link href="/">WebhookTrail endpoint</Link> as a webhook URL in Mailgun, send a test email, and open the request: the JSON body shows
        the signature block and event data, and the Raw tab shows the exact bytes. That lets you test your verifier against a real payload.
        WebhookTrail does not check Mailgun signatures for you. See <Link href="/tools/mailgun-webhook-tester">the Mailgun webhook tester</Link> for
        what it can and cannot do.
      </p>
      <p>
        Related: <Link href="/guides/verify-sendgrid-event-webhook-signatures">SendGrid signatures</Link>,{" "}
        <Link href="/guides/verify-twilio-request-signatures">Twilio signatures</Link> and the general{" "}
        <Link href="/tools/verify-webhook-signature">signature debugging page</Link>.
      </p>
    </GuideShell>
  );
}
