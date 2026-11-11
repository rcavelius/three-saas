export interface Guide {
  slug: string;
  title: string;
  description: string;
  updated: string;
}

export const GUIDES: Guide[] = [
  {
    slug: "verify-stripe-webhook-signatures",
    title: "Verify Stripe webhook signatures (and why the raw body matters)",
    description: "How the Stripe-Signature header is built, how to check it with the raw request body, and how to debug failures by capturing the exact bytes.",
    updated: "2026-11-11",
  },
  {
    slug: "verify-github-webhook-signatures",
    title: "Verify GitHub webhook signatures with X-Hub-Signature-256",
    description: "Compute the HMAC-SHA256 of the raw payload with your webhook secret, compare in constant time, and inspect real deliveries.",
    updated: "2026-11-11",
  },
  {
    slug: "test-webhook-retries-with-replay",
    title: "Test your webhook receiver's retries and idempotency with replay",
    description: "Capture a real webhook, verify your staging receiver, then replay it once or with retries to check idempotency and error handling.",
    updated: "2026-11-11",
  },
];
