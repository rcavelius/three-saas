import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "../GuideShell";
import { GUIDES } from "../guides";

const guide = GUIDES.find((g) => g.slug === "test-webhook-retries-with-replay")!;

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: `/guides/${guide.slug}` },
  openGraph: { title: guide.title, description: guide.description, type: "article" },
};

const STEPS = [
  "Capture a real delivery from the provider on a WebhookTrail endpoint.",
  "Add your staging receiver as a replay destination and verify it by echoing the challenge.",
  "Replay the captured request once and check your receiver's response and side effects.",
  "Replay with retries against a failing or slow receiver and confirm duplicates are handled idempotently.",
];

export default function Page() {
  return (
    <GuideShell guide={guide} steps={STEPS}>
      <p>
        Webhook senders retry: a timeout or a 5xx from your receiver makes them send the same event again, sometimes minutes later. A receiver
        that is not idempotent then charges twice, emails twice or creates duplicate rows. Replay lets you reproduce this with a real payload
        instead of a hand-written fixture. Replay is part of the <Link href="/pricing">Developer and Pro plans</Link>.
      </p>
      <h2>1. Capture a real delivery</h2>
      <p>
        Create an endpoint, point the provider&apos;s test webhook at its capture URL and trigger an event. The inspector shows headers, body and
        query exactly as received.
      </p>
      <h2>2. Verify your staging receiver</h2>
      <p>
        Replays only go to destinations your workspace has verified. Add the receiver&apos;s URL under Replay destinations and click Verify.
        WebhookTrail POSTs <code>{`{"type":"webhooktrail.verify","challenge":"…"}`}</code>; answer 2xx with the challenge:
      </p>
      <pre>
        <code>{`if (body.type === "webhooktrail.verify") return Response.json({ challenge: body.challenge });`}</code>
      </pre>
      <p>Only public addresses on ports 80/443 qualify, redirects are not followed, and changing the URL requires verifying again.</p>
      <h2>3. Replay once</h2>
      <p>
        Open the request, pick the destination and replay. By default sensitive headers such as <code>Authorization</code> or{" "}
        <code>X-Api-Key</code> are left out; tick them only if your staging receiver needs them. Signature headers are sent but their timestamp
        is old, so providers&apos; libraries with a tolerance window (Stripe, Svix) will reject the signature: test signature checks with fresh
        events, and use replay for the handling logic after verification.
      </p>
      <h2>4. Replay with retries</h2>
      <p>
        Choose &quot;with retries&quot; and up to 5 attempts. Attempt 1 is sent immediately; if it does not get a 2xx, the next attempts follow
        after about 10, 20, 40 and 80 seconds, stopping at the first 2xx. Make your receiver fail on purpose (return 500 for the first call) and
        check that the eventual success processes the event exactly once, for example by storing the provider&apos;s event id with a unique
        constraint. Each attempt, its status code and timing appear in the replay history.
      </p>
    </GuideShell>
  );
}
