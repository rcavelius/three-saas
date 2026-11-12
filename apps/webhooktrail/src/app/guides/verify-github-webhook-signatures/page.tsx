import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "../GuideShell";
import { GUIDES } from "../guides";

const guide = GUIDES.find((g) => g.slug === "verify-github-webhook-signatures")!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guides/${guide.slug}` },
  openGraph: { title: guide.title, description: guide.description, type: "article" },
};

const STEPS = [
  "Set a webhook secret in the GitHub webhook settings.",
  "Read the raw request body before any JSON parsing.",
  "Compute sha256= followed by the hex HMAC-SHA256 of the raw body, keyed with the secret.",
  "Compare it with the X-Hub-Signature-256 header in constant time; reject on mismatch.",
];

export default function Page() {
  return (
    <GuideShell guide={guide} steps={STEPS}>
      <p>
        When a GitHub webhook has a secret, every delivery carries an <code>X-Hub-Signature-256</code> header:{" "}
        <code>sha256=</code> followed by the hex HMAC-SHA256 of the request body, keyed with that secret. Unlike Stripe, the signature has no
        timestamp, so it does not expire.
      </p>
      <h2>Steps</h2>
      <ol>
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <pre>
        <code>{`import { createHmac, timingSafeEqual } from "node:crypto";

function verifyGitHub(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}`}</code>
      </pre>
      <p>
        Use the raw bytes: a parsed-and-re-serialized JSON body produces a different HMAC. The older <code>X-Hub-Signature</code> header uses
        SHA-1; prefer the SHA-256 one.
      </p>
      <h2>Inspecting real deliveries</h2>
      <p>
        Point a test webhook at a <Link href="/">WebhookTrail endpoint</Link> to see exactly what GitHub sends: the <code>X-GitHub-Event</code> and{" "}
        <code>X-GitHub-Delivery</code> headers, the signature (masked until you reveal it) and the body as a JSON tree, raw text or hex. Because
        the signature has no timestamp, a captured GitHub delivery replayed to your own verified staging server still verifies if your server
        uses the same secret, which makes it useful for testing handlers. Keep that in mind for production too: deduplicate on{" "}
        <code>X-GitHub-Delivery</code> if replays of a leaked request would be harmful.
      </p>
    </GuideShell>
  );
}
