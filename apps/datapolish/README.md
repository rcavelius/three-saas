# DataPolish

A spreadsheet cleaner that runs entirely in the browser. Files are read by the page, cleaned in a Web Worker and downloaded locally; nothing is uploaded. There is no AI in it: every step is a deterministic, unit-tested rule.

Accounts, billing and saved workflows are server-side (Better Auth, Stripe, Postgres) via the shared packages. **The database never holds file contents**: it stores accounts, organizations, billing state, ops data (jobs, incidents, email outbox, first-party analytics) and saved workflows (lists of steps).

## Run

```bash
# from the repo root (dependencies are installed at the root)
npm run dev:datapolish          # http://localhost:3002, database in apps/datapolish/.data/datapolish (PGlite)
cd apps/datapolish
npx vitest run                  # unit, component and server integration tests (PGlite in memory, FakeStripe)
npx tsc -p tsconfig.json --noEmit
npx next build
```

Environment: see `.env.example`. With nothing set, the app runs on an embedded PGlite database, emails go to the `ops_email_outbox` table (and to `.data/mail/*.txt` when `DEV_MAIL_DIR` is set with a localhost `APP_URL`), and billing reports "not configured".

### End-to-end (headless Edge, production build)

```bash
npx next build
APP_URL=http://localhost:3102 DATABASE_URL=pglite:./.data/e2e DEV_MAIL_DIR=./.data/e2e-mail \
  SESSION_SECRET=<32+ chars> TRUSTED_PROXY=none npx next start --port 3102
npx playwright test -c e2e/playwright.config.ts
```

- `e2e/no-upload.spec.ts` — the privacy proof: runs clean → merge → batch → ZIP (CSV and XLSX) with files whose names and cells contain a unique marker, records every request (page, worker, beacons, `/api/events`), and asserts that no URL or body contains the marker or file bytes, every request is same-origin, `connect-src` is exactly `'self'`, and a deliberate cross-origin `fetch` is blocked by the browser.
- `e2e/smoke.spec.ts` — sign up → verification link → log in → tool → billing (no Stripe key: clear message) → team → `/admin` 404 → delete account; axe (no serious/critical issues), no CSP violations, no horizontal scroll at 390 px.

## Plan limits — honest framing

Plan values come only from `DATAPOLISH_CATALOG` in `@repo/billing` (Free $0 / Pro $12 / Business $29).

- **Local processing limits** (`maxFileMb`, `maxRows`, `filesPerBatch`) are applied in the browser from `GET /api/me/entitlements`, which the server computes from `billing.getEntitlements(orgId)` (anonymous visitors: the catalog's free plan). Because files never reach the server, these are **value fences, not security boundaries**: someone can change their own browser, and there is no server-side resource behind them to protect. This is stated in `src/lib/limits.ts`, the routes and the pricing FAQ.
- **Server-enforced limits** cover what the server actually stores: saved workflows (`savedWorkflows`, counted inside a transaction with `withOrgLock`) and team seats (`teamSeats`: Better Auth refuses to accept an invitation beyond the limit, and the app refuses new invitations once members + pending invitations fill the seats).
- **Downgrades** never delete: workflows over the new limit (the newest ones) become read-only — apply, export or delete, not edit; members over the seat count keep access and new invitations are blocked; the UI says so.

### Browser safeguards (all plans)

`src/lib/memory.ts` estimates memory before a file is read (file size × expansion factor; rows × columns after parsing) against `navigator.deviceMemory` / Chromium's JS heap limit (1 GB assumed otherwise) and refuses or warns with a clear message instead of letting the tab crash. The worker checks rows and cells right after parsing, before the table is copied back to the page. Hard caps apply even on Business: 256 MB per file, 512 MB loaded at once, 2,000,000 rows, 40 M cells per file, 60 M cells in total. Reading, cleaning and exporting can be cancelled (the worker is terminated and restarted).

## Saved workflows

- In this browser: localStorage (guarded; private mode falls back to export only), JSON export/import.
- In the account (Pro: 50, Business: unlimited and shared with the team): `workflows` table (`org_id`, `name`, `pipeline` jsonb validated with the engine's zod schema, `version`, `created_by`, timestamps). API: `GET/POST /api/workflows`, `GET/PUT/DELETE /api/workflows/:id`, org-scoped from `auth.requireOrg()`; another org's id answers 404. `PUT` takes `expectedVersion` for optimistic concurrency. Members delete only their own workflows; admins/owners any.
- "Import to my account" copies browser workflows into the account after sign-in.
- **Literal values typed into steps are stored as typed** (find & replace text, column names, separators). To keep cell data out of the database, find/replace values are capped at 1 KB (UTF-8) each and a pipeline at 32 KB; the request body schema is strict (no `org_id` or other extra fields).

## Analytics

First-party only (`/api/events`, cookie-less). `src/lib/analytics.ts` allows, per event, only counts and fixed words (e.g. `tool_used {action, mode, files, steps, format}`); the server repeats the same allow-list before storing. File names, column names and cell values cannot be expressed in an event (unit-tested, and checked end-to-end).

## Ops

- `/api/health` (public: status + version; details with `Authorization: Bearer $HEALTH_DETAILS_SECRET` or `$CRON_SECRET`), `/api/cron/tick` (Bearer `CRON_SECRET`), in-process scheduler with `RUN_SCHEDULER=1` (`src/instrumentation.ts`). Jobs: ops jobs (email outbox, owner alerts, budgets, billing health, uptime), `billing.reconcile` hourly, `datapolish.cleanup` daily (expired sessions/verifications, old rate-limit rows, analytics older than 13 months).
- `/admin` — internal dashboard for platform role `operator`/`owner` only; everyone else gets 404. Grant the role in SQL (no self-service elevation; `role` cannot be set through sign-up or profile updates):

  ```sql
  UPDATE auth_user SET role = 'owner' WHERE email = 'you@example.com';
  ```

## Security notes

- CSP with a per-request nonce from `src/proxy.ts` (`cspProxy`): `script-src 'nonce-…' 'strict-dynamic'`, **`connect-src 'self'` only** (Stripe Checkout/Portal are full-page redirects), `frame-ancestors 'none'`. Every page renders dynamically so Next can nonce its scripts. API responses get `default-src 'none'`.
- Mutating API routes require a same-origin request (Origin, or `Sec-Fetch-Site: same-origin`); Better Auth checks origins on its own routes. Rate limits key on the client IP from `TRUSTED_PROXY` only; the auth route copies that IP into a header Better Auth trusts and overwrites any client-sent value.
- Cookies are `dp.`-prefixed, http-only, SameSite=Lax, Secure in production.

## Layout

- `src/lib/engine/` pure TypeScript engine (no DOM): `parse`, `ops/*`, `pipeline`, `schema` (zod steps and workflows), `export`, `merge`, `zip` (fflate streaming ZIP).
- `src/lib/worker/` worker protocol and client (falls back to the main thread where Workers are unavailable; Cancel terminates and restarts the worker; 3-minute hard timeout).
- `src/server/` platform composition, routes (plain `Request → Response` functions), workflows repository, env; `src/app/api/**` binds them to Next.
- `src/components/` the cleaner, account, auth and billing UI.

## Known gaps

- The row limit is per file; a merge of several full files can exceed it (memory caps still apply).
- The regex safety check is a heuristic; the worker time-out and Cancel are the backstop.
- Two-digit years use a fixed pivot (00–49 → 20xx).
- Seats: members above a reduced seat count are not removed or suspended automatically, only new invitations are blocked.
