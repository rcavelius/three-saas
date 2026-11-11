# SiteProof

Free website inspection: enter a URL, SiteProof crawls up to 25 pages politely and writes an audit report
(broken links, titles, meta descriptions, canonicals, image alt text, sitemap, robots.txt, HTTPS/TLS/HSTS,
mixed content) with a transparent score. Reports get an unguessable share link.

## What works

- `POST /api/scan` `{ "url": "example.com" }` runs a real scan. Send `Accept: application/x-ndjson` for streamed
  progress (`accepted`, `progress`, then `result` or `error` lines); otherwise you get one JSON response
  `{ id, reportUrl, report }`.
- `/report/[id]` (noindex, 128-bit random id) and `/api/report/[id]` (JSON). Reports expire after `REPORT_RETENTION_DAYS`.
- Pages: `/` (scanner), `/docs` (each check explained), `/pricing`, `/signup` (placeholder, accounts not built),
  `/bot` (crawler policy), `/privacy` and `/terms` (drafts that need legal review).
- Limits: 5 scans/hour per client IP, 10 scans/hour per target host, 4 concurrent scans per process.

Not built yet: accounts, billing, monitoring, PDF export (browser print works), nonce-based CSP.

## Security model

All outbound requests go through `@repo/security` `safeFetch`:
http/https on ports 80/443 only, no credentials in URLs, no localhost/.local/.internal/single-label hosts, no
obfuscated IP spellings (`2130706433`, `0x7f.1`, ...), every DNS answer must be public unicast (private, loopback,
link-local/metadata, CGNAT, reserved, documentation, NAT64, IPv4-mapped... are rejected). The socket connects to the
exact validated IP (pinned lookup, so no DNS rebinding) while SNI/Host keep the hostname. Redirects are followed
by hand (max 5), each one validated again. GET/HEAD only, no cookies or auth headers, connect and total timeouts,
body size capped while streaming (after decompression). The loopback policy used by tests lives in
`@repo/security/testing`, refuses to run with `NODE_ENV=production`, and a test fails if app code imports it.

## Environment

See `.env.example`. Everything has a development default; nothing is required to run locally.

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_URL` | `http://localhost:3001` | Also in the bot user agent |
| `DATABASE_URL` | `pglite:./.data/siteproof` | `postgres://...` in production |
| `TRUSTED_IP_HEADER` | unset | Set to the header your proxy writes. Unset = all clients share one rate-limit bucket |
| `SCAN_RATE_LIMIT_PER_HOUR` | 5 | per client IP |
| `SCAN_TARGET_LIMIT_PER_HOUR` | 10 | per scanned host |
| `MAX_CONCURRENT_SCANS` | 4 | per process |
| `REPORT_RETENTION_DAYS` | 90 | |

## Run

```sh
cd apps/siteproof
npx next dev --port 3001      # http://localhost:3001
npx vitest run                # unit, integration (local fixture site) and component tests
npx tsc -p tsconfig.json --noEmit
```

Migrations (`src/lib/migrations.ts`, after `CORE_MIGRATIONS`) run automatically on first database use.

## Layout

- `src/lib/scanner/`: crawler (`scan.ts`), parsing (`html.ts`, `robots.ts`, `sitemap.ts`), pure checks
  (`checks/*`), score, production network deps (`deps.ts`)
- `src/lib/scan-handler.ts`: API logic (validation, rate limits, concurrency, streaming, persistence)
- `src/components/Report.tsx`: the report document, rendered on the server and in the client scanner
