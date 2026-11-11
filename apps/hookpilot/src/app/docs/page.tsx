import type { Metadata } from "next";
import { formatBytesShort, limits, PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Documentation" };

const free = PLANS.free;

const TOC = [
  ["capture-url", "Capture URL"],
  ["limits", "Limits"],
  ["responses", "Response codes"],
  ["custom", "Custom responses"],
  ["ownership", "Ownership and privacy"],
  ["api", "Inspection API"],
  ["errors", "API errors"],
] as const;

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-12 grid gap-10 lg:grid-cols-[200px_1fr]">
      <nav aria-label="On this page" className="lg:sticky lg:top-6 self-start">
        <p className="label mb-3">On this page</p>
        <ul className="grid gap-1.5 text-[13px] text-fg-muted">
          {TOC.map(([id, t]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-fg">
                {t}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="prose-doc max-w-[78ch] min-w-0">
        <p className="label">Documentation</p>
        <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.02em]">HookPilot reference</h1>
        <p>
          HookPilot gives you a URL that records every HTTP request sent to it, and a console to inspect them. This page describes
          exactly what is implemented today.
        </p>

        <h2 id="capture-url">Capture URL</h2>
        <pre>
          <code>{`https://<host>/h/<slug>[/<any/sub/path>][?<query>]`}</code>
        </pre>
        <ul>
          <li>
            <code>slug</code> is 24 URL-safe characters (144 random bits). Treat the URL as a secret: anyone who knows it can send to it.
          </li>
          <li>
            Accepted methods: <code>GET</code>, <code>POST</code>, <code>PUT</code>, <code>PATCH</code>, <code>DELETE</code>,{" "}
            <code>HEAD</code>, <code>OPTIONS</code>. Others get <code>405</code>.
          </li>
          <li>Everything after the slug is stored as the request path (still percent-encoded), plus the raw query string.</li>
          <li>
            Stored per request: method, path, query, headers (as <code>[name, value]</code> pairs, lower-cased and alphabetical as
            delivered by the runtime), body bytes, body size, truncation flag, content type, source IP, and time received.
          </li>
          <li>HookPilot never follows, fetches or forwards anything from a captured request.</li>
          <li>
            Capture responses allow any origin (<code>Access-Control-Allow-Origin: *</code>, without credentials) so browser code can post
            to them. <code>OPTIONS</code> preflights are captured too and answered with the allowed methods and requested headers.
          </li>
        </ul>
        <pre>
          <code>{`curl -X POST 'https://<host>/h/<slug>/orders?attempt=1' \\
  -H 'Content-Type: application/json' \\
  -d '{"type":"order.created","id":"ord_1042"}'

# → 200 {"ok":true,"id":"<request id>"}`}</code>
        </pre>

        <h2 id="limits">Limits (Free plan)</h2>
        <table>
          <tbody>
            <tr>
              <th>Stored body</th>
              <td>
                The first {formatBytesShort(free.storedBodyBytes)} of each body are stored. Larger bodies (up to the hard cap) are accepted
                and flagged <code>truncated</code>; the full size is recorded.
              </td>
            </tr>
            <tr>
              <th>Hard cap</th>
              <td>
                Bodies over {formatBytesShort(free.maxBodyBytes)} are rejected with <code>413</code> and nothing is stored. A declared{" "}
                <code>Content-Length</code> over the cap is rejected before reading; otherwise reading stops as soon as the cap is crossed.
              </td>
            </tr>
            <tr>
              <th>History</th>
              <td>
                The newest {free.historyPerEndpoint} requests per endpoint are kept. When a new request arrives beyond that, the oldest is
                deleted (requests are never refused for this reason). The lifetime count keeps growing.
              </td>
            </tr>
            <tr>
              <th>Rate limits</th>
              <td>
                {free.capturePerEndpointPerMinute} requests per minute per endpoint and {limits.capturePerIpPerMinute} per minute per
                source IP, in fixed one-minute windows. Over the limit: <code>429</code> with <code>Retry-After</code> (seconds).
              </td>
            </tr>
            <tr>
              <th>Endpoints</th>
              <td>
                Up to {limits.anonActiveEndpoints} active endpoints per browser; at most {limits.createPerIpPerHour} created per IP per hour.
              </td>
            </tr>
            <tr>
              <th>Expiry</th>
              <td>
                {free.retentionHours} hours after creation. You can set the expiry to 1–{free.retentionHours} hours from now, but never
                beyond 7 days after creation. Expired endpoints answer <code>410</code> and are then deleted with all their requests.
              </td>
            </tr>
          </tbody>
        </table>

        <h2 id="responses">Response codes of the capture URL</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>200</code> (or your custom status)
              </td>
              <td>
                Stored. Default body <code>{`{"ok":true,"id":"<request id>"}`}</code>; the id is also in the{" "}
                <code>X-HookPilot-Request-Id</code> header. <code>HEAD</code> gets headers only.
              </td>
            </tr>
            <tr>
              <td>
                <code>404</code>
              </td>
              <td>No such endpoint, or it was deleted.</td>
            </tr>
            <tr>
              <td>
                <code>405</code>
              </td>
              <td>Unsupported method.</td>
            </tr>
            <tr>
              <td>
                <code>410</code>
              </td>
              <td>The endpoint has expired.</td>
            </tr>
            <tr>
              <td>
                <code>413</code>
              </td>
              <td>Body larger than {formatBytesShort(free.maxBodyBytes)}. Not stored.</td>
            </tr>
            <tr>
              <td>
                <code>429</code>
              </td>
              <td>
                Rate limited. See <code>Retry-After</code>. Not stored.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Error bodies are JSON: <code>{`{"ok":false,"error":"<code>","message":"…"}`}</code>.
        </p>

        <h2 id="custom">Custom responses</h2>
        <p>Each endpoint can answer with your own status and body, set in the inspector&apos;s Settings or through the API:</p>
        <ul>
          <li>Status 200–599. 204, 205 and 304 must have an empty body.</li>
          <li>
            Content type <code>application/json</code> (body must be valid JSON, or empty for the default body) or <code>text/plain</code>.
            HTML, SVG and other active content types are refused, so no one can serve pages from our domain.
          </li>
          <li>Body at most {limits.responseBodyMaxBytes} bytes.</li>
          <li>
            Every capture response carries <code>X-Content-Type-Options: nosniff</code>,{" "}
            <code>Content-Security-Policy: sandbox; default-src &apos;none&apos;</code> and <code>Cache-Control: no-store</code>.
          </li>
        </ul>

        <h2 id="ownership">Ownership and privacy</h2>
        <ul>
          <li>
            Creating an endpoint without an account sets an <code>hp_owner</code> cookie (random 256-bit token, <code>HttpOnly</code>,{" "}
            <code>SameSite=Lax</code>, <code>Secure</code> in production, scoped to <code>/api</code>, 30 days). Only its SHA-256 hash is
            stored. Clearing cookies loses access to your endpoints.
          </li>
          <li>Every inspection call checks ownership. Endpoints you do not own answer 404, never 403.</li>
          <li>
            Sensitive headers (<code>Authorization</code>, <code>Proxy-Authorization</code>, <code>Cookie</code>, <code>Set-Cookie</code>,{" "}
            <code>X-Api-Key</code>, <code>*-Signature</code>, <code>*-Token</code>, <code>*-Secret</code>) and secret-looking query
            parameters are masked in the console until you click reveal. Headers and bodies are never written to server logs.
          </li>
          <li>The owner cookie is removed from captured headers if a browser happens to send it to a capture URL.</li>
        </ul>

        <h2 id="api">Inspection API</h2>
        <p>
          JSON over HTTPS, authenticated by the <code>hp_owner</code> cookie, so it is meant for the browser console. State-changing
          calls (<code>POST</code>, <code>PATCH</code>, <code>DELETE</code>) must send an <code>Origin</code> header equal to the app&apos;s
          origin and, if they have a body, <code>Content-Type: application/json</code>. Requests are limited to{" "}
          {limits.apiPerIpPerMinute} per minute per IP.
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
                <code>POST /api/endpoints</code>
              </td>
              <td>
                Create an endpoint. Body <code>{`{"name"?: string}`}</code> (max {limits.nameMaxLength} chars). Returns{" "}
                <code>201 {`{"endpoint": Endpoint}`}</code> and sets the owner cookie if missing.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/endpoints</code>
              </td>
              <td>
                Your endpoints: <code>{`{"endpoints": Endpoint[]}`}</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/endpoints/:id</code>
              </td>
              <td>
                One endpoint (also when expired, with <code>expired: true</code>).
              </td>
            </tr>
            <tr>
              <td>
                <code>PATCH /api/endpoints/:id</code>
              </td>
              <td>
                Any of <code>{`{"name": string, "expiresInHours": 1-${free.retentionHours}, "response": {"status", "contentType", "body"} | null}`}</code>.{" "}
                <code>null</code> restores the default response.
              </td>
            </tr>
            <tr>
              <td>
                <code>DELETE /api/endpoints/:id</code>
              </td>
              <td>Delete the endpoint and all its requests.</td>
            </tr>
            <tr>
              <td>
                <code>GET /api/endpoints/:id/requests</code>
              </td>
              <td>
                Newest first: <code>{`{"requests": RequestSummary[], "nextCursor": string | null}`}</code>. Query parameters below.
              </td>
            </tr>
            <tr>
              <td>
                <code>DELETE /api/endpoints/:id/requests</code>
              </td>
              <td>
                Delete all captured requests: <code>{`{"deleted": n}`}</code>.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/endpoints/:id/requests/:requestId</code>
              </td>
              <td>
                One request including <code>headers</code> and <code>bodyBase64</code> (the stored bytes).
              </td>
            </tr>
            <tr>
              <td>
                <code>DELETE /api/endpoints/:id/requests/:requestId</code>
              </td>
              <td>Delete one request.</td>
            </tr>
          </tbody>
        </table>
        <h3>List parameters</h3>
        <table>
          <tbody>
            <tr>
              <th>
                <code>limit</code>
              </th>
              <td>1–100, default 50.</td>
            </tr>
            <tr>
              <th>
                <code>before</code>
              </th>
              <td>
                Cursor from <code>nextCursor</code>: the next (older) page.
              </td>
            </tr>
            <tr>
              <th>
                <code>after</code>
              </th>
              <td>
                Cursor of the newest request you have: only newer requests. The console polls this every 2 seconds while visible.
              </td>
            </tr>
            <tr>
              <th>
                <code>method</code>
              </th>
              <td>One of the seven methods.</td>
            </tr>
            <tr>
              <th>
                <code>q</code>
              </th>
              <td>
                Up to 200 characters, matched case-insensitively against path, query and headers, and against the stored body (exact bytes
                for non-ASCII text). <code>%</code> and <code>_</code> are literal.
              </td>
            </tr>
            <tr>
              <th>
                <code>from</code>, <code>to</code>
              </th>
              <td>ISO 8601 timestamps with offset, inclusive.</td>
            </tr>
          </tbody>
        </table>

        <h2 id="errors">API errors</h2>
        <p>
          Errors are <code>{`{"error": {"code": string, "message": string, "issues"?: [...]}}`}</code> with status <code>400</code> (validation),{" "}
          <code>403</code> (bad origin), <code>404</code> (not found or not yours), <code>410</code> (endpoint expired),{" "}
          <code>413</code>, <code>415</code> (not JSON) or <code>429</code> (rate or endpoint limit, with <code>Retry-After</code> when
          time-based).
        </p>
      </article>
    </div>
  );
}
