import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "../GuideShell";
import { GUIDES } from "../guides";

const guide = GUIDES.find((g) => g.slug === "verify-stripe-webhook-signatures")!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guides/${guide.slug}` },
  openGraph: { title: guide.title, description: guide.description, type: "article" },
};

export default function Page() {
  return (
    <GuideShell guide={guide}>
      <p>
        Stripe signs every webhook it sends to an endpoint with that endpoint&apos;s signing secret (<code>whsec_…</code>). If your handler
        accepts unsigned or wrongly signed requests, anyone who learns the URL can fake events such as <code>invoice.paid</code>.
      </p>

      <h2>What the header contains</h2>
      <p>
        The <code>Stripe-Signature</code> header looks like <code>t=1700000000,v1=5257a8…,v1=…</code>. <code>t</code> is the Unix timestamp of
        the delivery attempt; each <code>v1</code> is a hex HMAC-SHA256. During a secret rotation there can be more than one <code>v1</code>.
      </p>
      <p>The signed string is the timestamp, a dot, and the exact request body bytes:</p>
      <pre>
        <code>{`signed_payload = t + "." + raw_body
expected       = hex(HMAC_SHA256(key = signing_secret, message = signed_payload))
valid          = any v1 equals expected (constant-time compare) and |now - t| within your tolerance`}</code>
      </pre>
      <p>
        The official libraries do this for you (for example <code>stripe.webhooks.constructEvent(rawBody, header, secret)</code> in Node, which
        uses a 300-second tolerance by default). The tolerance protects against replay of an old, captured request.
      </p>

      <h2>The usual bug: the body is not raw anymore</h2>
      <p>
        The signature covers the bytes Stripe sent. If a JSON body parser runs first and you re-serialize the object, whitespace and key order
        change and the signature no longer matches. Read the body as a string or buffer for the webhook route (in Express,{" "}
        <code>express.raw({`{ type: "application/json" }`})</code>; in a Next.js route handler, <code>await request.text()</code>) and parse it
        only after verification.
      </p>

      <h2>Debugging a failing signature</h2>
      <ol>
        <li>
          Create a <Link href="/">HookPilot endpoint</Link> and add its capture URL as a webhook endpoint in a Stripe test-mode account (or
          forward events to it).
        </li>
        <li>
          Trigger an event. In the inspector, the Raw and Hex views show the exact body bytes, and the <code>stripe-signature</code> header is
          shown masked until you reveal it.
        </li>
        <li>Compute the HMAC over <code>t + "." + body</code> with that endpoint&apos;s signing secret and compare. Note that each Stripe webhook endpoint has its own secret.</li>
        <li>Compare with what your framework hands your handler: if the bytes differ, a middleware changed the body.</li>
      </ol>
      <p>
        Replaying a captured Stripe event to your server later will normally fail verification on purpose: the timestamp is older than the
        tolerance. That is the protection working, not a bug in your code.
      </p>
    </GuideShell>
  );
}
