import { CATALOG, FREE_PLAN, formatBytesShort, formatCount, formatHours, limits, planLimitsFor, priceLabel } from "@/lib/plans";
import { CAPTURE_METHODS, RESPONSE_CONTENT_TYPES } from "@/lib/types";

/**
 * One landing page per search people type ("webhook tester", "stripe webhook tester", "replay webhook"),
 * each answered by the real product: the page carries the real "Create endpoint" button. Every plan
 * number below is rendered from WEBHOOKTRAIL_CATALOG (via @/lib/plans), never typed by hand, and every
 * feature named is pinned to the code by tools.test.ts.
 */

/** Which part of WebhookTrail does the job. `replay` is gated by the catalog feature of the same name. */
export type ToolFeature = "capture" | "inspector" | "customResponses" | "replay" | "testPayloads";

export interface ToolPage {
  slug: string;
  /** <title> and search snippet: the phrase people type. */
  title: string;
  h1: string;
  description: string;
  intro: string;
  feature: ToolFeature;
  /** The feature as named in the app, shown on the page. */
  featureName: string;
  howTo: string[];
  faq: { q: string; a: string }[];
  /** Existing guides, help articles and docs sections that go deeper. */
  links: { href: string; label: string }[];
}

const plans = CATALOG.plans.map((p) => ({ def: p, lim: planLimitsFor(p.id) }));
const free = planLimitsFor(FREE_PLAN.id);
const paid = plans.filter((p) => p.def.priceMonthlyCents > 0).sort((a, b) => a.def.priceMonthlyCents - b.def.priceMonthlyCents);

const joinAnd = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** Plans that include replay, from the catalog feature flag. */
export const REPLAY_PLANS = plans.filter((p) => p.def.features.replay);
export const replayPlanNames = joinAnd(REPLAY_PLANS.map((p) => p.def.name));
const replayFrom = REPLAY_PLANS.slice().sort((a, b) => a.def.priceMonthlyCents - b.def.priceMonthlyCents)[0];
export const replayFromPrice = replayFrom ? `${priceLabel(replayFrom.def)}/month` : "";

/** The one-time pass that includes replay (catalog pass "week"), e.g. "the 7-day pass ($5 once, no subscription)". */
const replayPass = (CATALOG.passes ?? []).find((p) => p.features.replay);
const replayPassPrice = replayPass ? `$${(replayPass.priceCents / 100).toFixed(replayPass.priceCents % 100 === 0 ? 0 : 2)}` : "";
export const replayPassNote = replayPass ? `the ${replayPass.name} (${replayPassPrice} once, no subscription)` : "";

/** Free plan in one sentence (anonymous endpoints get the Free plan too). */
export const freePlanFacts =
  `The Free plan needs no account: up to ${formatCount(free.endpoints)} endpoints, ${formatCount(free.requestsPerMonth)} captured requests a month, ` +
  `the newest ${formatCount(free.requestsStored)} requests kept per endpoint for ${days(free.historyDays)}, and endpoints that expire ` +
  `${formatHours(free.endpointTtlHours ?? 24)} after creation (you can extend one to at most ${formatHours(limits.freeMaxLifetimeHours)}).`;

/** Paid plans in one sentence. */
export const paidPlanFacts = paid
  .map(
    (p) =>
      `${p.def.name} (${priceLabel(p.def)}/month): ${formatCount(p.lim.endpoints)} endpoints that do not expire, ${formatCount(p.lim.requestsPerMonth)} requests a month, ` +
      `${formatCount(p.lim.requestsStored)} kept per endpoint for ${days(p.lim.historyDays)}, bodies up to ${formatBytesShort(p.lim.maxBodyBytes)}`,
  )
  .join("; ")
  .concat(".");

const methods = joinAnd([...CAPTURE_METHODS]);
const responseTypes = joinAnd(RESPONSE_CONTENT_TYPES.map((t) => `\`${t}\``)).replace(/`/g, "");

const GUIDE_STRIPE = { href: "/guides/verify-stripe-webhook-signatures", label: "Guide: verify Stripe webhook signatures" };
const GUIDE_GITHUB = { href: "/guides/verify-github-webhook-signatures", label: "Guide: verify GitHub webhook signatures" };
const GUIDE_SLACK = { href: "/guides/verify-slack-request-signatures", label: "Guide: verify Slack request signatures" };
const GUIDE_TWILIO = { href: "/guides/verify-twilio-request-signatures", label: "Guide: verify Twilio request signatures" };
const GUIDE_REPLAY = { href: "/guides/test-webhook-retries-with-replay", label: "Guide: test retries and idempotency with replay" };
const HELP_START = { href: "/help/getting-started", label: "Help: getting started" };
const HELP_REPLAY = { href: "/help/replay-and-destinations", label: "Help: replay requests to verified destinations" };
const HELP_MASKING = { href: "/help/inspecting-requests-and-masking", label: "Help: inspecting requests and masked secrets" };
const DOCS_CUSTOM = { href: "/docs#custom", label: "Docs: custom responses" };
const DOCS_CAPTURE = { href: "/docs#capture-url", label: "Docs: the capture URL" };
const DOCS_API = { href: "/docs#api", label: "Docs: inspection API" };

const FAQ_NO_SIGNATURE_CHECK =
  "No. WebhookTrail records the request exactly as it arrived and does not check signatures for you. It shows the signature header and the raw body, which is what you need to compute and compare the signature in your own code.";

export const TOOLS: ToolPage[] = [
  {
    slug: "webhook-tester",
    title: "Webhook tester: free URL to capture and inspect webhooks",
    h1: "Webhook tester",
    description:
      "Get a webhook URL in one click and watch every request arrive in a live console: headers, query and body as a JSON tree. Free, no account needed.",
    intro:
      "Point any service at a WebhookTrail URL and see exactly what it sends. Each request appears in the console within a couple of seconds, with every header, the query string and the body.",
    feature: "inspector",
    featureName: "Capture URL and live inspector",
    howTo: [
      "Click Create endpoint. You get a capture URL like https://webhooktrail.com/h/<slug>.",
      "Paste the URL into the webhook settings of the service you are testing, or send a request with curl.",
      "Watch the request appear in the inspector. Open it to see headers, query and the body as a JSON tree, form fields, raw text or hex.",
    ],
    faq: [
      { q: "Do I need an account?", a: freePlanFacts },
      {
        q: "Which HTTP methods are captured?",
        a: `${methods}. Any sub-path after the slug and the query string are stored too. Other methods get 405.`,
      },
      {
        q: "What does the URL answer?",
        a: `By default 200 with {"ok":true,"id":"<request id>"}. You can set your own status code and a ${responseTypes} body in the endpoint settings.`,
      },
      {
        q: "How does the console update?",
        a: "It polls every 2 seconds while the tab is visible, so new requests show up without reloading. Hidden tabs stop polling and catch up when you return.",
      },
    ],
    links: [HELP_START, DOCS_CAPTURE, HELP_MASKING],
  },
  {
    slug: "request-bin",
    title: "Request bin: capture and inspect HTTP requests online",
    h1: "Request bin: capture and inspect HTTP requests",
    description:
      "A request bin for any HTTP client: send GET, POST, PUT, PATCH or DELETE to a URL and read headers, query and body. Copy any request as cURL. Free.",
    intro:
      "Need to see what a client, script or browser actually sends? Create a bin, send requests to it, and read them back exactly as they arrived, then copy any of them as a cURL command to send again from your terminal.",
    feature: "capture",
    featureName: "Capture URL",
    howTo: [
      "Click Create endpoint to get a capture URL.",
      "Send requests to it from your app, script, browser or curl. Add any sub-path or query string you like.",
      "Open a request in the inspector to read it, or use Copy as cURL to reproduce it.",
    ],
    faq: [
      {
        q: "Can I call it from a web page (CORS)?",
        a: "Yes. Capture responses send Access-Control-Allow-Origin: * (without credentials), and OPTIONS preflights are captured too, so you can see them.",
      },
      {
        q: "What exactly is stored?",
        a: "Method, path, query, headers, the body up to your plan's stored size, the full body size, content type, the sender's IP address and the time received. WebhookTrail's own cookies are removed from stored headers.",
      },
      {
        q: "Can I read requests from a script?",
        a: "Yes, through the inspection API, scoped to your workspace or, for an endpoint created without an account, to your browser's owner cookie.",
      },
      { q: "What are the limits?", a: freePlanFacts },
    ],
    links: [DOCS_CAPTURE, DOCS_API, HELP_START],
  },
  {
    slug: "stripe-webhook-tester",
    title: "Stripe webhook tester: inspect Stripe events and signatures",
    h1: "Stripe webhook tester",
    description:
      "Send Stripe webhook events to a WebhookTrail URL and inspect the exact payload, the Stripe-Signature header and the raw body your signature check needs.",
    intro:
      "Add a WebhookTrail capture URL as a webhook endpoint in Stripe and see each event exactly as Stripe sends it: the JSON body, the Stripe-Signature header and the raw bytes, which is what signature verification depends on.",
    feature: "inspector",
    featureName: "Capture URL and live inspector",
    howTo: [
      "Click Create endpoint and copy the capture URL.",
      "In your Stripe Dashboard's webhook settings, add an endpoint with that URL and choose the events you want, then trigger one.",
      "Open the event in the inspector. The Stripe-Signature header is masked until you reveal it; the Raw tab shows the body bytes as received.",
    ],
    faq: [
      { q: "Does WebhookTrail verify the Stripe signature?", a: FAQ_NO_SIGNATURE_CHECK },
      {
        q: "Can I resend a Stripe event to my own server?",
        a: `Yes, with replay on the ${replayPlanNames} plans (from ${replayFromPrice}), to a destination you have verified. The Stripe-Signature header is sent, but its signed timestamp is old, so Stripe's libraries will usually reject it: use replay to test your handling logic, and fresh events to test signature checks.`,
      },
      {
        q: "Does it work with Stripe test mode?",
        a: "Yes. WebhookTrail records whatever is sent to the URL; it does not talk to Stripe and needs no Stripe keys.",
      },
    ],
    links: [GUIDE_STRIPE, HELP_MASKING, GUIDE_REPLAY],
  },
  {
    slug: "github-webhook-tester",
    title: "GitHub webhook tester: inspect payloads and X-Hub-Signature-256",
    h1: "GitHub webhook tester",
    description:
      "Use a WebhookTrail URL as a GitHub webhook payload URL and inspect each delivery: event headers, X-Hub-Signature-256 and the JSON or form payload.",
    intro:
      "Add a WebhookTrail URL as the payload URL of a GitHub webhook and see every delivery: the X-GitHub-Event and X-GitHub-Delivery headers, the signature header and the full payload, as JSON or decoded form fields.",
    feature: "inspector",
    featureName: "Capture URL and live inspector",
    howTo: [
      "Click Create endpoint and copy the capture URL.",
      "In your repository or organization settings, add a webhook with that URL as the payload URL and pick the events.",
      "Trigger an event (GitHub also sends a ping when you create the webhook) and open the delivery in the inspector.",
    ],
    faq: [
      {
        q: "Which content type should I choose?",
        a: "Either works. application/json shows as a JSON tree; application/x-www-form-urlencoded is decoded into form fields, with the JSON inside the payload field.",
      },
      { q: "Does WebhookTrail check X-Hub-Signature-256?", a: FAQ_NO_SIGNATURE_CHECK },
      {
        q: "Is my webhook secret exposed?",
        a: "The secret itself is never sent by GitHub; only the HMAC in X-Hub-Signature-256 is. That header is masked in the inspector until you reveal it.",
      },
    ],
    links: [GUIDE_GITHUB, HELP_MASKING, HELP_START],
  },
  {
    slug: "shopify-webhook-tester",
    title: "Shopify webhook tester: see exactly what Shopify sends",
    h1: "Shopify webhook tester",
    description:
      "Point a Shopify webhook at a WebhookTrail URL and inspect each notification: the topic and HMAC headers and the full JSON body, live in your browser.",
    intro:
      "Shopify webhooks are plain HTTPS POST requests, so WebhookTrail captures them like any other: you see the X-Shopify-Topic and X-Shopify-Hmac-Sha256 headers and the full JSON body of each notification.",
    feature: "inspector",
    featureName: "Capture URL and live inspector",
    howTo: [
      "Click Create endpoint and copy the capture URL.",
      "Use it as the webhook URL in your store's or app's webhook settings, with the JSON format.",
      "Send a test notification or trigger the event, then open the request in the inspector.",
    ],
    faq: [
      {
        q: "Is there anything Shopify-specific in WebhookTrail?",
        a: "No. WebhookTrail treats Shopify like any webhook sender: it records the request exactly as received and shows it. It does not connect to your store or verify the HMAC for you.",
      },
      {
        q: "Can I make the URL return an error to see Shopify retry?",
        a: "Yes. Set a custom status code such as 500 in the endpoint settings, and every retry is captured as its own request with its time.",
      },
      { q: "What are the limits?", a: freePlanFacts },
    ],
    links: [HELP_START, DOCS_CUSTOM, HELP_MASKING],
  },
  {
    slug: "twilio-webhook-tester",
    title: "Twilio webhook tester: inspect SMS and voice callbacks",
    h1: "Twilio webhook tester",
    description:
      "Point a Twilio webhook URL at WebhookTrail and inspect each callback: the form-encoded parameters, the X-Twilio-Signature header and the raw body, live.",
    intro:
      "Twilio sends its webhook requests as HTTPS POSTs, normally form-encoded (per Twilio's public documentation). Point a number's webhook or a status callback at a WebhookTrail URL and see each request: the decoded form fields, the signature header and the raw body.",
    feature: "inspector",
    featureName: "Capture URL and live inspector",
    howTo: [
      "Click Create endpoint and copy the capture URL.",
      "Paste it as the webhook or status callback URL in your Twilio console settings.",
      "Send a message or place a call, then open the request in the inspector: form fields are decoded, and the raw body is one tab away.",
    ],
    faq: [
      {
        q: "Does WebhookTrail check X-Twilio-Signature?",
        a: FAQ_NO_SIGNATURE_CHECK,
      },
      {
        q: "Can I see the exact form parameters Twilio sent?",
        a: "Yes. A form-encoded body is shown as decoded fields, and the Raw tab shows the exact bytes, which is what matters when you debug a signature mismatch.",
      },
      {
        q: "Is there a Twilio integration?",
        a: "No. WebhookTrail treats Twilio like any webhook sender: it records the request as received. It does not connect to your Twilio account, and the default response is not TwiML; you can set a custom response in the endpoint settings.",
      },
      { q: "What are the limits?", a: freePlanFacts },
    ],
    links: [HELP_START, HELP_MASKING, DOCS_CUSTOM, GUIDE_TWILIO],
  },
  {
    slug: "slack-webhook-tester",
    title: "Slack webhook tester: inspect events and slash command requests",
    h1: "Slack webhook tester",
    description:
      "Use a WebhookTrail URL as a Slack request URL and inspect each request: the X-Slack-Signature and timestamp headers and the full JSON or form body.",
    intro:
      "Slack delivers Events API calls and slash commands to your request URL as HTTPS POSTs (per Slack's public documentation). Use a WebhookTrail URL there to see the signature and timestamp headers and the full body of each request.",
    feature: "inspector",
    featureName: "Capture URL and live inspector",
    howTo: [
      "Click Create endpoint and copy the capture URL.",
      "Enter it as a request URL in your Slack app settings, for example for event subscriptions or a slash command.",
      "Trigger the event or run the command, then open the request in the inspector.",
    ],
    faq: [
      {
        q: "Will Slack accept the URL when it verifies it?",
        a: "Not necessarily. For Events API URLs Slack's documentation says the endpoint must answer a verification challenge, and WebhookTrail's responses are static (you can set a status code, content type and body, up to 4096 bytes). It is best for inspecting requests that Slack sends, such as slash commands and events, not for passing URL verification.",
      },
      { q: "Does WebhookTrail check X-Slack-Signature?", a: FAQ_NO_SIGNATURE_CHECK },
      {
        q: "Can I see the signature timestamp header?",
        a: "Yes. All headers are shown. Signature-like headers are masked until you reveal them; the raw body is available unchanged, which you need to compute the signature yourself.",
      },
    ],
    links: [GUIDE_SLACK, HELP_START, DOCS_CUSTOM, HELP_MASKING],
  },
  {
    slug: "paypal-webhook-tester",
    title: "PayPal webhook tester: inspect webhook event notifications",
    h1: "PayPal webhook tester",
    description:
      "Use a WebhookTrail URL as a PayPal webhook listener and inspect each event notification: the JSON body and the PayPal transmission headers, live.",
    intro:
      "PayPal sends webhook event notifications to your listener URL as HTTPS POSTs with a JSON body (per PayPal's public documentation). Use a WebhookTrail URL as the listener to see each event's headers and exact body before you write your handler.",
    feature: "inspector",
    featureName: "Capture URL and live inspector",
    howTo: [
      "Click Create endpoint and copy the capture URL.",
      "Add it as a webhook listener URL in your PayPal developer dashboard and choose the events to subscribe to.",
      "Trigger an event, for example a sandbox payment, then open the request in the inspector to read the headers and JSON body.",
    ],
    faq: [
      {
        q: "Does WebhookTrail verify PayPal's signature?",
        a: FAQ_NO_SIGNATURE_CHECK,
      },
      {
        q: "Can I see the exact JSON PayPal sent?",
        a: "Yes. The JSON body is shown formatted, and the Raw tab shows the exact bytes as received.",
      },
      {
        q: "Is there a PayPal integration?",
        a: "No. WebhookTrail treats PayPal like any webhook sender: it records the request as received and does not connect to your PayPal account.",
      },
      { q: "What are the limits?", a: freePlanFacts },
    ],
    links: [HELP_START, HELP_MASKING, DOCS_CUSTOM],
  },
  {
    slug: "sendgrid-webhook-tester",
    title: "SendGrid event webhook tester: inspect email event batches",
    h1: "SendGrid event webhook tester",
    description:
      "Use a WebhookTrail URL as a SendGrid Event Webhook target and inspect each batch of email events: the JSON array body and the signature headers.",
    intro:
      "SendGrid's Event Webhook posts email events such as delivered, open and click to your URL as HTTPS POSTs with a JSON body (per SendGrid's public documentation). Use a WebhookTrail URL as the target to see exactly what arrives.",
    feature: "inspector",
    featureName: "Capture URL and live inspector",
    howTo: [
      "Click Create endpoint and copy the capture URL.",
      "Enter it as the HTTP POST URL in your SendGrid Event Webhook settings and select the events to send.",
      "Send a test email or use SendGrid's test event, then open the request in the inspector.",
    ],
    faq: [
      {
        q: "Does WebhookTrail verify the SendGrid signature?",
        a: FAQ_NO_SIGNATURE_CHECK,
      },
      {
        q: "Can I see the whole batch of events?",
        a: "Yes. The JSON body is shown formatted and the Raw tab shows the exact bytes, which you need if you verify a signature over the raw payload.",
      },
      {
        q: "Is there a SendGrid integration?",
        a: "No. WebhookTrail treats SendGrid like any webhook sender: it records the request as received and does not connect to your SendGrid account.",
      },
      { q: "What are the limits?", a: freePlanFacts },
    ],
    links: [HELP_START, HELP_MASKING, DOCS_CUSTOM],
  },
  {
    slug: "mailgun-webhook-tester",
    title: "Mailgun webhook tester: inspect delivery event webhooks",
    h1: "Mailgun webhook tester",
    description:
      "Use a WebhookTrail URL as a Mailgun webhook target and inspect each delivery event: the JSON body, including its signature block, and the request headers.",
    intro:
      "Mailgun can post email events such as delivered, opened and failed to a webhook URL you configure, as HTTPS POSTs with a JSON body (per Mailgun's public documentation). Use a WebhookTrail URL as the target to see exactly what arrives before you write your handler.",
    feature: "inspector",
    featureName: "Capture URL and live inspector",
    howTo: [
      "Click Create endpoint and copy the capture URL.",
      "Add it as a webhook URL for the events you want in your Mailgun dashboard, or use Mailgun's test webhook option if it offers one for your account.",
      "Send a test email, then open the request in the inspector to read the headers and the JSON body.",
    ],
    faq: [
      {
        q: "Does WebhookTrail verify the Mailgun signature?",
        a: FAQ_NO_SIGNATURE_CHECK,
      },
      {
        q: "Can I see the exact JSON Mailgun sent?",
        a: "Yes. The JSON body is shown formatted, and the Raw tab shows the exact bytes as received.",
      },
      {
        q: "Is there a Mailgun integration?",
        a: "No. WebhookTrail treats Mailgun like any webhook sender: it records the request as received and does not connect to your Mailgun account.",
      },
      { q: "What are the limits?", a: freePlanFacts },
    ],
    links: [HELP_START, HELP_MASKING, DOCS_CUSTOM],
  },
  {
    slug: "replay-webhook",
    title: "Replay a webhook to your server, once or with retries",
    h1: "Replay a captured webhook",
    description: `Resend a captured webhook to your server, once or with up to 5 retries, and see each response. ${replayPlanNames} plans from ${replayFromPrice}${replayPass ? `, or a ${replayPassPrice} one-time pass` : ""}.`,
    intro:
      "Capture a real delivery once, then send it again to your receiver whenever you need to: after a fix, to test idempotency, or to reproduce a bug. Each attempt is recorded with its status code and timing.",
    feature: "replay",
    featureName: "Replay",
    howTo: [
      "Capture a request on an endpoint that belongs to your workspace.",
      "Add your receiver under Replay destinations and verify it by echoing the challenge WebhookTrail sends.",
      "Open the request, pick the destination and choose Replay once, or a number of attempts with retries.",
    ],
    faq: [
      {
        q: "Which plans include replay?",
        a: `${replayPlanNames}. ${paidPlanFacts}${replayPassNote ? ` For a single debugging week there is also ${replayPassNote}, which adds replay and the Developer capture limits for 7 days.` : ""}`,
      },
      {
        q: "What is sent?",
        a: "The captured method and body, to the destination URL exactly. Sensitive headers such as Authorization are left out unless you tick them; cookies, Host and hop-by-hop headers are never sent. The preview shows the exact headers first.",
      },
      {
        q: "Can I replay to localhost?",
        a: "No. Replays only go to verified destinations on public internet addresses (ports 80 and 443), never to private, loopback or cloud metadata addresses, and redirects are not followed. Use a public staging URL or a tunnel you control.",
      },
      {
        q: "How do retries work?",
        a: "With more than one attempt (up to 5), the first is sent at once; if it does not get a 2xx, the next follow after about 10, 20, 40 and 80 seconds, stopping at the first 2xx.",
      },
    ],
    links: [GUIDE_REPLAY, HELP_REPLAY, { href: "/docs#replay", label: "Docs: replay" }],
  },
  {
    slug: "mock-webhook-response",
    title: "Mock webhook response: set the status code and body",
    h1: "Mock a webhook response",
    description: `Make a capture URL answer with the status code (200 to 599) and the JSON or text body you choose, to test how a sender handles each response. Free.`,
    intro:
      "Some senders behave differently depending on what your endpoint answers. Set the response a WebhookTrail URL returns and see how the sender reacts, while every request it sends is still captured.",
    feature: "customResponses",
    featureName: "Custom response (endpoint settings)",
    howTo: [
      "Click Create endpoint, then open the endpoint settings.",
      `Under Response, choose a status code from 200 to 599, a content type (${responseTypes}) and a body.`,
      "Save response. New requests get this response; Reset to default goes back to {\"ok\":true,\"id\":\"<request id>\"}.",
    ],
    faq: [
      {
        q: "What can the body be?",
        a: `Valid JSON for application/json, or any text for text/plain, up to ${formatCount(limits.responseBodyMaxBytes)} bytes. 204, 205 and 304 must have an empty body. HTML and other active content types are refused.`,
      },
      {
        q: "Is this on the Free plan?",
        a: `Yes. Custom responses are included on every plan: ${joinAnd(plans.filter((p) => p.def.features.customResponses).map((p) => p.def.name))}.`,
      },
      {
        q: "Can I add a delay or a different response per request?",
        a: "No. An endpoint answers every request with the one response you set.",
      },
    ],
    links: [DOCS_CUSTOM, HELP_START, { href: "/docs#responses", label: "Docs: capture response codes" }],
  },
  {
    slug: "test-webhook-retries",
    title: "Test webhook retries: make your endpoint return 500",
    h1: "Test how a sender retries webhooks",
    description:
      "Make a WebhookTrail URL answer 500 or 503 and watch the sender retry: every attempt is captured with its time and headers, so you can see its retry schedule.",
    intro:
      "Webhook providers retry when your endpoint fails, but the schedule and headers differ. Make a capture URL fail on purpose and see every retry the sender makes, with timestamps.",
    feature: "customResponses",
    featureName: "Custom response (endpoint settings)",
    howTo: [
      "Click Create endpoint and set a custom response with status 500 or 503 in the endpoint settings.",
      "Point the sender at the capture URL and trigger an event.",
      "Watch each retry arrive in the inspector, then set the response back to 200 to see the sender stop.",
    ],
    faq: [
      {
        q: "Are retries stored as separate requests?",
        a: "Yes. Each attempt is captured as its own request, with its own time received and headers, so delivery ids and attempt counters are easy to compare.",
      },
      {
        q: "Can I test my own receiver's handling of duplicates?",
        a: `Yes, with replay on the ${replayPlanNames} plans: resend a captured request to your verified receiver once or with up to 5 attempts.`,
      },
      {
        q: "How long are the retries kept?",
        a: `For your plan's history period: ${plans.map((p) => `${days(p.lim.historyDays)} on ${p.def.name}`).join(", ")}.`,
      },
    ],
    links: [GUIDE_REPLAY, DOCS_CUSTOM, HELP_REPLAY],
  },
  {
    slug: "verify-webhook-signature",
    title: "Debug webhook signature verification with the raw body",
    h1: "Debug webhook signature verification",
    description:
      "Signature checks fail when the body changes. Capture the exact bytes a provider sends, with the signature header, and compare them with what your code hashes.",
    intro:
      "Most webhook signatures are an HMAC of the raw request body. If your framework parses and re-serializes JSON before you hash it, the check fails. WebhookTrail keeps the body exactly as received, so you can see the bytes the signature was computed over.",
    feature: "inspector",
    featureName: "Raw and Hex body views",
    howTo: [
      "Click Create endpoint and send a real delivery from the provider to the capture URL.",
      "Open the request, reveal the signature header and switch the body to Raw (or Hex for exact bytes).",
      "Compute the HMAC over those exact bytes with your secret and compare it with the header in constant time.",
    ],
    faq: [
      { q: "Does WebhookTrail verify signatures for me?", a: FAQ_NO_SIGNATURE_CHECK },
      {
        q: "Is the whole body stored?",
        a: `Up to your plan's stored size (${plans.map((p) => `${formatBytesShort(p.lim.storedBodyBytes)} on ${p.def.name}`).join(", ")}). Longer bodies are flagged as truncated, so you know the stored bytes are not the full payload.`,
      },
      {
        q: "Why is the Hex view hidden?",
        a: "The Hex view shows raw bytes, so it is hidden while secrets are masked. Reveal the request to see it.",
      },
    ],
    links: [GUIDE_STRIPE, GUIDE_GITHUB, HELP_MASKING],
  },
  {
    slug: "send-test-webhook",
    title: "Send a test webhook: sample JSON, form and malformed payloads",
    h1: "Send a test webhook payload",
    description:
      "Send sample webhook payloads to your own capture URL from the browser: a JSON event with a signature header, a form post, plain text or malformed JSON.",
    intro:
      "Want to see how a request looks before a real provider sends one? Every endpoint's console can send sample payloads to its own capture URL, as a real request from your browser.",
    feature: "testPayloads",
    featureName: "Send a test payload",
    howTo: [
      "Click Create endpoint to open the console.",
      "Choose Send a test payload and pick a sample: JSON event, form post, plain text, oversized payload or malformed JSON.",
      "Click Send and open the captured request in the inspector.",
    ],
    faq: [
      {
        q: "Does WebhookTrail send these from its servers?",
        a: "No. Your browser sends the sample straight to your own capture URL, so it is captured like any other request.",
      },
      {
        q: "What does the malformed JSON sample show?",
        a: "It declares application/json but the body is cut off, so the inspector shows the parse error next to the raw text.",
      },
      {
        q: "What does the oversized sample show?",
        a: `It sends a body of about 1.1 MB. A request over your plan's maximum size (${plans.map((p) => `${formatBytesShort(p.lim.maxBodyBytes)} on ${p.def.name}`).join(", ")}) is rejected with 413 and nothing is stored; under it, the sample is captured normally.`,
      },
    ],
    links: [HELP_START, DOCS_CAPTURE, { href: "/docs#responses", label: "Docs: capture response codes" }],
  },
];

export function getTool(slug: string): ToolPage | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
