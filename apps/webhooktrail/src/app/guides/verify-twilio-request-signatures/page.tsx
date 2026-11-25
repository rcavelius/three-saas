import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "../GuideShell";
import { GUIDES } from "../guides";

const guide = GUIDES.find((g) => g.slug === "verify-twilio-request-signatures")!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guides/${guide.slug}` },
  openGraph: { title: guide.title, description: guide.description, type: "article" },
};

const STEPS = [
  "Take the full URL Twilio was configured to call, exactly as written in the console, including the query string.",
  "For a form-encoded POST, sort the parameters by name and append each name followed by its value to the URL.",
  "Compute the base64 HMAC-SHA1 of that string with your Twilio auth token.",
  "Compare it with the X-Twilio-Signature header in constant time; reject on mismatch.",
];

export default function Page() {
  return (
    <GuideShell guide={guide} steps={STEPS}>
      <p>
        This guide follows Twilio&apos;s public documentation on validating requests; check it for the current details, and prefer Twilio&apos;s own
        helper libraries in production. Twilio sends an <code>X-Twilio-Signature</code> header with its webhook requests. For a form-encoded POST it is
        the base64 HMAC-SHA1 of the request URL followed by every POST parameter (sorted by name, each name directly followed by its value), keyed with
        your account&apos;s auth token.
      </p>
      <h2>Steps</h2>
      <ol>
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <pre>
        <code>{`import { createHmac, timingSafeEqual } from "node:crypto";

function verifyTwilio(url: string, params: Record<string, string>, signature: string | undefined, authToken: string): boolean {
  if (!signature) return false;
  const base = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", authToken).update(base).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}`}</code>
      </pre>
      <h2>Why verification fails</h2>
      <ul>
        <li>
          <strong>URL mismatch.</strong> The signed URL is the one configured in Twilio. Behind a proxy or tunnel your server may see a different
          scheme, host or port than the one Twilio called; rebuild the public URL, not the internal one.
        </li>
        <li>
          <strong>Parameters changed.</strong> Rebuild the string from the form fields as sent. If your framework drops, renames or re-encodes fields,
          the HMAC will not match.
        </li>
        <li>
          <strong>Wrong token.</strong> Use the auth token of the account (or subaccount) that sent the request.
        </li>
        <li>
          <strong>JSON bodies.</strong> Twilio documents a different scheme for JSON requests, based on a hash of the body; see its documentation
          rather than the form recipe above.
        </li>
      </ul>
      <h2>Inspecting a real request</h2>
      <p>
        Set a number&apos;s webhook or a status callback to a <Link href="/">WebhookTrail endpoint</Link>, send a message or place a call, and open the
        request: the form fields are decoded, the Raw tab shows the exact bytes, and the signature header is masked until you reveal it. That gives you
        the real parameter names and values to build the string by hand. WebhookTrail does not check Twilio signatures for you, and the default
        response is not TwiML. See <Link href="/tools/twilio-webhook-tester">the Twilio webhook tester</Link> for what it can and cannot do, and{" "}
        <Link href="/tools/send-test-webhook">send a test webhook</Link> to try your own verifier against a captured request.
      </p>
      <p>
        Related: <Link href="/guides/verify-slack-request-signatures">Slack signatures</Link>,{" "}
        <Link href="/guides/verify-github-webhook-signatures">GitHub signatures</Link> and the general{" "}
        <Link href="/tools/verify-webhook-signature">signature debugging page</Link>.
      </p>
    </GuideShell>
  );
}
