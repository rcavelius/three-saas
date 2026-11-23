import type { Metadata } from "next";
import { PageHead } from "@/components/grid/PageHead";
import { CATALOG, formatBytesShort, formatCount, limits, limitsFromPlan } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Documentation",
  description: "WebhookTrail reference: capture URLs, plan limits, response and error codes, the inspection API, replay and destination verification.",
  alternates: { canonical: "/docs" },
};

const PLANS = CATALOG.plans.map((p) => limitsFromPlan(p.id, p.limits, p.features, p.name));
const FREE = PLANS.find((p) => p.planId === CATALOG.freePlanId)!;

const TOC = [
  ["capture-url", "Capture URL"],
  ["limits", "Plan limits"],
  ["responses", "Capture response codes"],
  ["custom", "Custom responses"],
  ["ownership", "Accounts, ownership and privacy"],
  ["api", "Inspection API"],
  ["live", "Live polling"],
  ["replay", "Replay"],
  ["verify", "Destination verification"],
  ["errors", "API errors"],
] as const;

function C({ children }: { children: React.ReactNode }) {
  return <code>{children}</code>;
}

export default function DocsPage() {
  return (
    <div className="g-frame">
      <PageHead word="Docs" lead={<><h2 className="font-mono text-[15px] font-bold uppercase tracking-[0.04em] text-fg">WebhookTrail reference</h2><p className="mt-3">WebhookTrail gives you a URL that records every HTTP request sent to it, a console to inspect them, and (on paid plans or with the one-time 7-day pass) replay of a
          captured request to a destination you have verified. This page describes exactly what is implemented.</p></>} />
      <div className="g-row grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="On this page" className="g-x p-4 md:p-5">
        <div className="lg:sticky lg:top-6">
        <p className="g-cap mb-3 text-fg-dim">On this page</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[12.5px] lg:grid-cols-1">
          {TOC.map(([id, t]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-signal">
                {t}
              </a>
            </li>
          ))}
        </ul>
        </div>
      </nav>

      <article className="prose-doc g-x min-w-0 px-4 pb-12 md:px-8">
        <div className="max-w-[78ch]">
        <h2 id="capture-url">Capture URL</h2>
        <pre>
          <code>{`https://<host>/h/<slug>[/<any/sub/path>][?<query>]`}</code>
        </pre>
        <ul>
          <li>
            <C>slug</C> is 24 URL-safe characters (144 cryptographically random bits). Treat the URL as a secret: anyone who knows it can send to
            it. The capture URL needs no authentication and never reveals stored data; it only answers with the endpoint&apos;s configured
            response.
          </li>
          <li>
            Accepted methods: <C>GET</C>, <C>POST</C>, <C>PUT</C>, <C>PATCH</C>, <C>DELETE</C>, <C>HEAD</C>, <C>OPTIONS</C>. Others get{" "}
            <C>405</C>.
          </li>
          <li>Everything after the slug is stored as the request path (still percent-encoded), plus the raw query string.</li>
          <li>
            Stored per request: method, path, query, headers (as <C>[name, value]</C> pairs, lower-cased and alphabetical as delivered by the
            runtime), body bytes up to the plan&apos;s stored size, full body size, truncation flag, content type, client IP and time received.
            WebhookTrail&apos;s own cookies (session and owner token) are removed from stored headers.
          </li>
          <li>Capturing never fetches or forwards anything. Only an explicit replay sends a request, and only to a verified destination.</li>
          <li>
            Capture responses allow any origin (<C>Access-Control-Allow-Origin: *</C>, without credentials). <C>OPTIONS</C> preflights are
            captured too.
          </li>
        </ul>
        <pre>
          <code>{`curl -X POST 'https://<host>/h/<slug>/orders?attempt=1' \\
  -H 'Content-Type: application/json' \\
  -d '{"type":"order.created","id":"ord_1042"}'

# -> 200 {"ok":true,"id":"<request id>"}`}</code>
        </pre>

        <h2 id="limits">Plan limits</h2>
        <p>Limits come from your workspace&apos;s plan, checked on the server for every request. Anonymous endpoints use the Free plan.</p>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Limit</th>
                {PLANS.map((p) => (
                  <th key={p.planId}>{p.planName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Active endpoints", (p) => formatCount(p.endpoints)],
                  ["Captured requests per calendar month (UTC)", (p) => formatCount(p.requestsPerMonth)],
                  ["Max payload (larger: 413)", (p) => formatBytesShort(p.maxBodyBytes)],
                  ["Stored body per request (rest truncated)", (p) => formatBytesShort(p.storedBodyBytes)],
                  ["Requests kept per endpoint (oldest pruned)", (p) => formatCount(p.requestsStored)],
                  ["History (older requests deleted)", (p) => `${p.historyDays} d`],
                  ["Endpoint expiry", (p) => (p.endpointTtlHours === null ? "never" : `${p.endpointTtlHours} h`)],
                  ["Capture rate per endpoint", (p) => `${p.capturePerEndpointPerMinute}/min`],
                  ["Replay", (p) => (p.replay ? "yes" : "no")],
                  ["Team seats", (p) => String(p.teamSeats)],
                ] as [string, (p: (typeof PLANS)[number]) => string][]
              ).map(([label, f]) => (
                <tr key={label}>
                  <th>{label}</th>
                  {PLANS.map((p) => (
                    <td key={p.planId}>{f(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul>
          <li>
            Per client IP: {limits.capturePerIpPerMinute} captures per minute (fixed one-minute windows; IPv6 counted per /64). The client IP
            is taken only from the header set by the hosting proxy, so a spoofed <C>X-Forwarded-For</C> changes nothing.
          </li>
          <li>
            A declared <C>Content-Length</C> over the payload limit is rejected before reading; otherwise reading stops as soon as the limit is
            crossed.
          </li>
          <li>
            The monthly quota counts every stored request of the workspace (or, for anonymous endpoints, of the browser&apos;s owner token).
            The check is atomic, so concurrent requests can never exceed it. Owners get one email per month when 80% is used.
          </li>
          <li>
            Free endpoints expire {FREE.endpointTtlHours} hours after creation; you can set the expiry to 1–{FREE.endpointTtlHours} hours from
            now, never beyond 7 days after creation. Paid endpoints do not expire. Expired endpoints answer <C>410</C> and are then deleted with
            their requests by the retention job (every 15 minutes), which also deletes requests older than the plan&apos;s history.
          </li>
          <li>
            After a downgrade, endpoints above the new limit are paused (oldest stay active): they answer <C>423</C>, keep their history and
            resume after an upgrade.
          </li>
          <li>At most {limits.createPerIpPerHour} endpoints can be created per IP per hour.</li>
        </ul>

        <h2 id="responses">Capture response codes</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>
                <C>error</C>
              </th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <C>200</C> (or your custom status)
              </td>
              <td>—</td>
              <td>
                Stored. Default body <C>{`{"ok":true,"id":"<request id>"}`}</C>; the id is also in <C>X-WebhookTrail-Request-Id</C>.
              </td>
            </tr>
            <tr>
              <td>
                <C>404</C>
              </td>
              <td>
                <C>not_found</C>
              </td>
              <td>No such endpoint, or it was deleted.</td>
            </tr>
            <tr>
              <td>
                <C>405</C>
              </td>
              <td>
                <C>method_not_allowed</C>
              </td>
              <td>Unsupported method.</td>
            </tr>
            <tr>
              <td>
                <C>410</C>
              </td>
              <td>
                <C>expired</C>
              </td>
              <td>The endpoint has expired.</td>
            </tr>
            <tr>
              <td>
                <C>413</C>
              </td>
              <td>
                <C>payload_too_large</C>
              </td>
              <td>
                Body over the plan&apos;s payload limit (<C>limitBytes</C> in the body). Not stored, not counted.
              </td>
            </tr>
            <tr>
              <td>
                <C>423</C>
              </td>
              <td>
                <C>endpoint_paused</C>
              </td>
              <td>The workspace&apos;s plan no longer covers this endpoint. Not stored.</td>
            </tr>
            <tr>
              <td>
                <C>429</C>
              </td>
              <td>
                <C>rate_limited</C>
              </td>
              <td>
                Per-IP or per-endpoint rate limit. See <C>Retry-After</C>. Not stored.
              </td>
            </tr>
            <tr>
              <td>
                <C>429</C>
              </td>
              <td>
                <C>quota_exceeded</C>
              </td>
              <td>
                Monthly request quota used up. Body also has <C>limit</C>, <C>used</C>, <C>period</C> (<C>YYYY-MM</C>) and <C>resetsAt</C>;{" "}
                <C>Retry-After</C> counts down to the next month (UTC). Not stored.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Error bodies are JSON: <C>{`{"ok":false,"error":"<code>","message":"…"}`}</C>.
        </p>

        <h2 id="custom">Custom responses</h2>
        <ul>
          <li>Status 200–599. 204, 205 and 304 must have an empty body.</li>
          <li>
            Content type <C>application/json</C> (valid JSON, or empty for the default body) or <C>text/plain</C>. HTML, SVG and other active
            types are refused.
          </li>
          <li>Body at most {limits.responseBodyMaxBytes} bytes.</li>
          <li>
            Every capture response carries <C>X-Content-Type-Options: nosniff</C>,{" "}
            <C>Content-Security-Policy: sandbox; default-src &apos;none&apos;</C> and <C>Cache-Control: no-store</C>.
          </li>
        </ul>

        <h2 id="ownership">Accounts, ownership and privacy</h2>
        <ul>
          <li>
            Without an account, creating an endpoint sets an <C>wt_owner</C> cookie (random 256-bit token, <C>HttpOnly</C>,{" "}
            <C>SameSite=Lax</C>, <C>Secure</C> in production, path <C>/api</C>, 30 days). Only its SHA-256 is stored.
          </li>
          <li>
            With an account, endpoints belong to your workspace and every member sees them. After signing up or logging in, &quot;Claim my
            anonymous endpoints&quot; moves the endpoints of this browser&apos;s owner cookie (and only those) into the workspace, up to the
            plan&apos;s endpoint limit.
          </li>
          <li>Only workspace owners and admins can delete endpoints, manage replay destinations and the team; only the owner manages billing.</li>
          <li>Every inspection call is scoped to your workspace (or owner cookie). Anything else answers 404, never 403.</li>
          <li>
            Masked by default in the console, the cURL export and the replay preview: sensitive headers (<C>Authorization</C>, <C>Cookie</C>,{" "}
            <C>X-Api-Key</C>, <C>*-Token</C>, <C>*-Api-Key</C>, <C>*-Secret</C>, <C>*-Signature</C>), secret-looking query parameters, JSON
            and form fields with secret-like names (password, token, secret, api_key, authorization, card number, cvv…) and card-number-like
            digit runs. Revealing is an explicit action per view. Headers and bodies are never written to server logs.
          </li>
        </ul>

        <h2 id="api">Inspection API</h2>
        <p>
          JSON over HTTPS for the browser console, authenticated by your session cookie (signed in) or the <C>wt_owner</C> cookie
          (anonymous). State-changing calls must send an <C>Origin</C> header equal to the app&apos;s origin and, with a body,{" "}
          <C>Content-Type: application/json</C>. {limits.apiPerIpPerMinute} calls per minute per client IP.
        </p>
        <table>
          <thead>
            <tr>
              <th>Call</th>
              <th>Does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <C>POST /api/endpoints</C>
              </td>
              <td>
                Create an endpoint in your workspace (signed in) or anonymously. Body <C>{`{"name"?: string}`}</C>. <C>201</C>, or <C>403</C>{" "}
                <C>endpoint_limit</C>.
              </td>
            </tr>
            <tr>
              <td>
                <C>GET /api/endpoints</C>
              </td>
              <td>
                <C>{`{"endpoints": Endpoint[], "anonymous": Endpoint[], "signedIn": boolean}`}</C>: <C>anonymous</C> lists this browser&apos;s
                claimable endpoints when signed in.
              </td>
            </tr>
            <tr>
              <td>
                <C>POST /api/endpoints/claim</C>
              </td>
              <td>
                Signed in: claim this browser&apos;s anonymous endpoints. <C>{`{"claimed": n, "skipped": n}`}</C>.
              </td>
            </tr>
            <tr>
              <td>
                <C>GET /api/endpoints/:id</C>
              </td>
              <td>
                One endpoint (also when expired). Includes <C>locked</C>, <C>expiresAt</C> (null = never) and <C>permissions</C>.
              </td>
            </tr>
            <tr>
              <td>
                <C>PATCH /api/endpoints/:id</C>
              </td>
              <td>
                Any of <C>{`{"name", "expiresInHours": 1-${FREE.endpointTtlHours} (expiring endpoints only), "response": {"status","contentType","body"} | null}`}</C>.
              </td>
            </tr>
            <tr>
              <td>
                <C>DELETE /api/endpoints/:id</C>
              </td>
              <td>Delete the endpoint and its requests (owner/admin for workspace endpoints).</td>
            </tr>
            <tr>
              <td>
                <C>GET /api/endpoints/:id/requests</C>
              </td>
              <td>
                <C>{`{"requests": RequestSummary[], "nextCursor", "hasMore"?}`}</C>, newest first. Sends an <C>ETag</C>; answers <C>304</C> to a
                matching <C>If-None-Match</C>.
              </td>
            </tr>
            <tr>
              <td>
                <C>DELETE /api/endpoints/:id/requests</C>
              </td>
              <td>Delete all captured requests.</td>
            </tr>
            <tr>
              <td>
                <C>GET|DELETE /api/endpoints/:id/requests/:requestId</C>
              </td>
              <td>
                One request including <C>headers</C> and <C>bodyBase64</C> (stored bytes) / delete it.
              </td>
            </tr>
            <tr>
              <td>
                <C>GET|POST /api/endpoints/:id/requests/:requestId/replay</C>
              </td>
              <td>Replay audit rows / start a replay (see below).</td>
            </tr>
            <tr>
              <td>
                <C>GET|POST /api/destinations</C>, <C>PATCH|DELETE /api/destinations/:id</C>, <C>POST /api/destinations/:id/verify</C>
              </td>
              <td>Replay destinations of your workspace (changes: owner/admin).</td>
            </tr>
          </tbody>
        </table>
        <h3>List parameters</h3>
        <ul>
          <li>
            <C>limit</C> 1–100 (default 50); <C>before</C> = <C>nextCursor</C> for the next older page; <C>method</C>; <C>q</C> (up to 200
            characters over path, query, headers and body; <C>%</C> and <C>_</C> literal); <C>from</C>/<C>to</C> (ISO 8601 with offset).
          </li>
          <li>
            <C>after</C> = a request&apos;s <C>cursor</C>: only newer requests. This mode returns the <em>oldest</em> page after the cursor (still
            listed newest first) with <C>hasMore</C>, so a client that was away pages forward without gaps.
          </li>
        </ul>

        <h2 id="live">Live polling</h2>
        <p>
          The console polls <C>?after=</C> every 2 seconds while the tab is visible, sending <C>If-None-Match</C> (an unchanged endpoint answers{" "}
          <C>304</C>). When the tab is hidden or you pause, polling stops; on return it catches up page by page and de-duplicates by request id.
          On errors it retries after 1, 2, 4… up to 30 seconds and shows &quot;reconnecting&quot;. Refresh fetches immediately.
        </p>

        <h2 id="replay">Replay (Developer and Pro)</h2>
        <ul>
          <li>
            <C>POST /api/endpoints/:id/requests/:requestId/replay</C> with{" "}
            <C>{`{"destinationId": uuid, "includeSensitiveHeaders"?: string[], "attempts"?: 1-5}`}</C>. Only a destination id is accepted,
            never a URL; it must belong to your workspace (else <C>404</C>) and be verified (else <C>409</C> <C>destination_not_verified</C>).
          </li>
          <li>
            The captured method and body are sent to the destination URL exactly (the captured path and query are not appended). Methods{" "}
            <C>GET POST PUT PATCH DELETE</C>; bodies up to 1 MB (<C>413</C> otherwise); a <C>GET</C> is sent without a body.
          </li>
          <li>
            Headers: <C>Authorization</C>, <C>Cookie</C>, <C>*-Token</C>, <C>*-Api-Key</C>, <C>*-Secret</C> and similar are left out unless
            listed in <C>includeSensitiveHeaders</C> for that replay. Signature headers (<C>Stripe-Signature</C>, <C>X-Hub-Signature-256</C>,{" "}
            <C>Svix-*</C>…) are sent, but their signed timestamp is probably stale, so the receiver may reject them. Hop-by-hop, <C>Host</C>,{" "}
            <C>Content-Length</C>, cookies and forwarding headers are never sent. Each replay adds <C>X-WebhookTrail-Replay-Id</C> and{" "}
            <C>User-Agent: WebhookTrail-Replay/1.0</C>.
          </li>
          <li>
            Network rules: public unicast addresses only (checked after DNS resolution, connection pinned to the checked address), ports 80 and
            443, redirects never followed (a 3xx is recorded as the result), 15-second timeout, response body read up to 64 KB (the first 4 KB
            shown). Never to WebhookTrail itself.
          </li>
          <li>
            Limits: {limits.replayPerOrgPerMinute} replays per minute per workspace and {limits.replayPerDestinationPerMinute} per destination;
            over that, <C>429</C> with <C>Retry-After</C>.
          </li>
          <li>
            <C>attempts</C> &gt; 1 (&quot;replay with retries&quot;): attempt 1 is sent at once; if it does not get a 2xx, the next attempt is
            scheduled through the job queue after 10, 20, 40 and 80 seconds (it runs on the next scheduler tick after that), until a 2xx or{" "}
            <C>attempts</C> is reached. Scheduled attempts are skipped if the destination was deleted, changed or unverified, or the plan lost
            replay.
          </li>
          <li>
            Every attempt is an audit row: who, when, destination URL, attempt, status (<C>delivered</C>, <C>failed</C>, <C>blocked</C>,{" "}
            <C>skipped</C>, <C>scheduled</C>), response status and elapsed milliseconds.
          </li>
        </ul>

        <h2 id="verify">Destination verification</h2>
        <ol>
          <li>An owner or admin adds a destination URL. URLs with private, loopback, link-local or metadata addresses, other ports, embedded credentials, special-use names or WebhookTrail&apos;s own host are refused.</li>
          <li>
            Verify sends{" "}
            <C>{`POST <url>  Content-Type: application/json  {"type":"webhooktrail.verify","challenge":"<32+ random characters>"}`}</C> with the
            same network rules as replay.
          </li>
          <li>
            Your endpoint answers <C>2xx</C> with the challenge in the body: either the bare string or <C>{`{"challenge":"<challenge>"}`}</C>.
            Anything else (other status, redirect, wrong body) leaves it unverified with the reason shown.
          </li>
          <li>Changing the URL clears the verification. Verification attempts are limited to {limits.verifyPerDestinationPerMinute} per minute per destination.</li>
        </ol>
        <pre>
          <code>{`// Example receiver (Node / Express)
app.post("/webhooks", express.json(), (req, res) => {
  if (req.body?.type === "webhooktrail.verify") return res.json({ challenge: req.body.challenge });
  // ... handle replayed webhooks
  res.sendStatus(204);
});`}</code>
        </pre>

        <h2 id="errors">API errors</h2>
        <p>
          Errors are <C>{`{"error": {"code": string, "message": string, "issues"?: [...]}}`}</C>. Status <C>400</C> (validation, e.g. an
          unexpected field), <C>401</C> (sign-in required), <C>403</C> (bad origin, <C>insufficient_role</C>, <C>plan_required</C>,{" "}
          <C>endpoint_limit</C>), <C>404</C> (not found or not yours), <C>409</C> (<C>destination_not_verified</C>, duplicate), <C>410</C>{" "}
          (endpoint expired), <C>413</C>, <C>415</C> (not JSON), <C>422</C> (destination URL refused, method not replayable), <C>429</C>{" "}
          (rate limited, with <C>Retry-After</C>), <C>503</C> (<C>billing_not_configured</C>).
        </p>
        </div>
      </article>
      </div>
    </div>
  );
}
