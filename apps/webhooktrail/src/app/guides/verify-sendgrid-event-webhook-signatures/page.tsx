import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "../GuideShell";
import { GUIDES } from "../guides";

const guide = GUIDES.find((g) => g.slug === "verify-sendgrid-event-webhook-signatures")!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guides/${guide.slug}` },
  openGraph: { title: guide.title, description: guide.description, type: "article" },
};

const STEPS = [
  "Keep the raw request body exactly as received, before any JSON parsing.",
  "Read the X-Twilio-Email-Event-Webhook-Timestamp header and build the payload: the timestamp followed directly by the raw body.",
  "Decode the base64 X-Twilio-Email-Event-Webhook-Signature header and verify it as an ECDSA signature over that payload using the public key from your SendGrid Event Webhook settings.",
  "Reject the request if verification fails (and consider rejecting stale timestamps).",
];

export default function Page() {
  return (
    <GuideShell guide={guide} steps={STEPS}>
      <p>
        <Link href="/guides/verify-twilio-request-signatures">Verify Twilio request signatures</Link> and{" "}
        <Link href="/tools/send-test-webhook">send a test webhook</Link> are related. This guide follows SendGrid&apos;s public documentation on the
        signed Event Webhook; check it for the current details, and prefer SendGrid&apos;s own helper libraries in production. When signature
        verification is enabled, SendGrid adds two headers to Event Webhook requests: <code>X-Twilio-Email-Event-Webhook-Signature</code> and{" "}
        <code>X-Twilio-Email-Event-Webhook-Timestamp</code>. The signature is an ECDSA signature, verified with the public key shown in your Event
        Webhook settings, over the timestamp concatenated with the raw request body.
      </p>
      <h2>Steps</h2>
      <ol>
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <pre>
        <code>{`import { createPublicKey, createVerify } from "node:crypto";

// publicKeyBase64: the verification key from your SendGrid Event Webhook settings (base64 DER, SPKI)
function verifySendGrid(rawBody: Buffer, signature: string | undefined, timestamp: string | undefined, publicKeyBase64: string): boolean {
  if (!signature || !timestamp) return false;
  const key = createPublicKey({ key: Buffer.from(publicKeyBase64, "base64"), format: "der", type: "spki" });
  const verifier = createVerify("sha256");
  verifier.update(timestamp);
  verifier.update(rawBody);
  return verifier.verify(key, Buffer.from(signature, "base64"));
}`}</code>
      </pre>
      <h2>Why verification fails</h2>
      <ul>
        <li>
          <strong>Parsed body.</strong> The payload is a JSON array of events. If your framework parses and re-serializes it, whitespace and key
          order change and the signature no longer matches. Verify against the raw bytes.
        </li>
        <li>
          <strong>Wrong key.</strong> Use the public key from the Event Webhook settings that sent the request; each webhook configuration has its own.
        </li>
        <li>
          <strong>Timestamp handling.</strong> The timestamp is part of the signed payload, so use the header value as sent, unchanged.
        </li>
        <li>
          <strong>Signing not enabled.</strong> If the headers are missing, signature verification is probably not turned on for that webhook in
          SendGrid.
        </li>
      </ul>
      <h2>Inspecting a real request</h2>
      <p>
        Enter a <Link href="/">WebhookTrail endpoint</Link> as the Event Webhook HTTP POST URL, send a test email, and open the request: the Raw tab
        shows the exact bytes of the event batch, and the signature header is masked until you reveal it. That lets you test your verifier against a
        real payload. WebhookTrail does not check SendGrid signatures for you. See{" "}
        <Link href="/tools/sendgrid-webhook-tester">the SendGrid webhook tester</Link> for what it can and cannot do.
      </p>
      <p>
        Related: <Link href="/guides/verify-twilio-request-signatures">Twilio signatures</Link>,{" "}
        <Link href="/guides/verify-stripe-webhook-signatures">Stripe signatures</Link> and the general{" "}
        <Link href="/tools/verify-webhook-signature">signature debugging page</Link>.
      </p>
    </GuideShell>
  );
}
