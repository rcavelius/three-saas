# Hosting decision — 2026-11-12

Goal: run ChangeKite, GridRinse and WebhookTrail at the lowest reasonable cost, with no daily work for the owner.
Nothing in this document has been purchased or activated.

## 1. Measured resource needs (real Docker images, GitHub Actions run on commit 0f87970)

Each image was started against PostgreSQL 17, then hit with 500 page/API requests (20 concurrent) plus app-specific work.

| | ChangeKite | GridRinse | WebhookTrail |
|---|---|---|---|
| Image size | 464 MB | 436 MB | 443 MB |
| Cold start (container start → healthy, incl. first-boot DB migrations) | 3.1 s | 1.7 s | 2.0 s |
| Idle memory | 169 MB | 138 MB | 139 MB |
| Peak memory under load | 337 MB | 312 MB | 328 MB |
| Peak / average CPU during load (of one core) | 65% / 19% | 65% / 21% | 70% / 31% |
| p50 / p95 latency | 9 / 45 ms | 8 / 172 ms | 11 / 51 ms |
| App-specific | real scan of example.com: 1.45 s | — | 500 captures in 3.5 s (120 stored, 380 rate-limited by design) |

Conclusion: each app needs **≈350 MB peak** today, so Cloudflare's `lite` (256 MiB) is too small and **`basic` (1 GiB, ¼ vCPU, 4 GB disk)** fits all three with headroom. Long ChangeKite crawls (250–1,000 pages on paid plans) will need more memory/CPU at scale (`standard-1`).

## 2. Options compared

| | Cloudflare Containers | Netlify Free | Google Cloud Run (free tier) | Render Free | Fly.io |
|---|---|---|---|---|---|
| Runs our existing apps unchanged | Yes (same Docker images CI verifies) | GridRinse yes (running now); WebhookTrail mostly; **ChangeKite no** | Yes (same Docker images) | Yes | Yes |
| Long work (ChangeKite crawls, 45–60 s) | Yes | **No** — functions are cut off after ~10 s; recurring scans can't run in the 7 s tick | Yes (up to 60 min per request) | Yes | Yes |
| Idle behaviour | Scale to zero, ~2–3 s wake | Serverless | Scale to zero, ~2–3 s wake | **Sleeps after 15 min, ~1 min wake** | Auto-stop |
| Free allowance | None ($5/month plan required for Containers) | 300 credits/month **shared with your 12 other Netlify sites** | 2M requests, 180k vCPU-s, 360k GiB-s per month | 750 h; free Postgres expires (30–90 days) | No free tier |
| What happens at the limit | Billed overage (no native hard cap) | **Every site on the team pauses** until next month | Billed overage (no native hard cap) | Service sleeps | Billed |
| Same place as the domains/DNS | Yes | No | No | No | No |
| New account/billing setup for you | Upgrade click only | None | New Google Cloud billing account + card | New account | New account + card |

Free-hosting verdict:
- **Netlify Free cannot host all three**: ChangeKite's crawls exceed Netlify's function time limit (would need a rewrite into background jobs), and the 300-credit team budget is shared with your other 12 Netlify sites. Each production deploy costs 15 credits, compute costs 10 credits per GB-hour, and bandwidth 20 credits per GB. GridRinse's scheduled jobs alone use about 30 credits a month, and about 1,000 monthly visitors would add roughly 200 credits of bandwidth. Running out pauses **all** your sites, not just these.
- **Render Free** is not reliable for paying customers (1-minute wake-ups, ephemeral disk, expiring database).
- **Google Cloud Run** is the one credible free option: it runs our images unchanged and its free tier would likely cover us up to ~1,000 users. It costs about $5–10/month less than Cloudflare at launch, but adds a third provider, needs a Google billing account and card, has no hard cap either, and keeps the apps away from Cloudflare where the domains live. Not worth the extra moving part at this stage; it remains a fallback.

## 3. Cloudflare Containers — how it would run

- **Shape:** one Worker per app (routes the custom domain, rate-limits, forwards to the container) + one Container class running our existing image, instance type `basic`, `sleepAfter` 15 min, `max_instances` 1–2 per app (raised only when needed).
- **Scheduled jobs:** a Cloudflare Cron Trigger calls `/api/cron/tick` every 30 min (wakes the container if asleep); while awake, the in-process scheduler ticks every 15 min, and code that queues an email triggers an immediate tick so verification/billing emails are sent within seconds, not at the next cron.
- **Webhook ingestion (WebhookTrail):** capture requests reach the Worker instantly; if the container is asleep the first request waits ~2–3 s for it to wake (common senders such as Stripe and GitHub wait ≥10 s). Once paying customers rely on it, WebhookTrail should be kept warm (always-on adds ~$7/month).
- **Database:** Neon Postgres, **one project with three databases** (one compute shared by all three apps, so the free 100 CU-hours/month are not split three ways). Containers connect through Neon's pooled endpoint; pool size 5 per app; Neon suspends after 5 min idle and wakes in under a second.
- **Cold starts:** container 1.7–3.1 s (measured) + Neon wake ≤1 s, only after idle periods.
- **Backups:** Neon point-in-time history (short window on Free) **plus** a nightly `pg_dump` of all three databases to Cloudflare R2 (free 10 GB) from a GitHub Actions schedule, with a monthly automated restore drill (the same check that passes in CI today).
- **Incident recovery:** a crashed container is restarted on the next request; health endpoints + the ops scheduler raise incidents and email the owner; an external uptime monitor checks each domain every 5 min; rollback = redeploy the previous image tag from GitHub Actions.

## 4. Monthly cost estimates (Cloudflare Containers, all three apps)

Rates (Workers Paid): $5/month plan; memory $0.009 per GiB-hour, CPU $0.072 per active vCPU-hour, disk $0.00025 per GB-hour, with 25 GiB-h + 6.25 vCPU-h + 200 GB-h included each month. One `basic` instance running all month ≈ **$7.60** (memory $6.57 + disk $0.74 + idle CPU ≈ $0.26).

"Users" = registered accounts across the three products, ~10% paying; each paying ChangeKite customer monitors ~3 sites daily; WebhookTrail averages ~1,000 captures per user per month.

| Users | Scale-to-zero (awake share) | Always-on | Database (Neon) | Email (Resend) | **Total, scale-to-zero** | **Total, always-on** |
|---|---|---|---|---|---|---|
| 0 | ~25% awake (crons, bots) → $5 + $5 = **$10** | $5 + $22 = $27 | Free | Free | **≈ $10** | ≈ $27 |
| 100 | ~50% → $5 + $11 = **$16** | $27 | Free | Free | **≈ $16** | ≈ $27 |
| 1,000 | ~95% (effectively always-on) → $27 + scan/capture CPU ≈ $1 + 2nd ChangeKite instance $8 | $36 | Launch, usage ≈ $15–25 | Pro $20 if >3,000 emails/month | **≈ $60–80** | ≈ $60–80 |
| 10,000 | 2× `standard-1` ChangeKite (~$60), 2× GridRinse (~$15), 3× WebhookTrail (~$23), CPU/requests ~$8, plan $5 | same | Launch/Scale ≈ $50–100 | Pro $20–35 | **≈ $180–270** | same |

Not included: Stripe fees (~3.9% + 30¢ per payment, proportional to revenue), domains ($33.51/year, already paid), optional AI support (capped in code at $5/month per app).

Costs that can exceed these estimates: abusive traffic hitting the Worker before it is blocked (Workers requests beyond 10M/month cost $0.30 per million), ChangeKite customers with very large sites (more CPU/memory per crawl), WebhookTrail customers sending millions of webhooks, container egress beyond the included amount, and Neon compute if the database never gets to sleep.

## 5. Spending alerts, caps and fail-safes

| Cost | Hard cap possible? | How |
|---|---|---|
| Container compute (the main variable cost) | **Yes, effectively** | `max_instances` per app + fixed instance type + `sleepAfter`. Worst case with max_instances = 2 and every instance pegged 24/7: ≈ $122/month + $5 plan. With max_instances = 1: ≈ $65. |
| Workers requests | Partly | Cloudflare WAF rate-limiting rule (blocks before the Worker runs, so blocked requests aren't billed) + app-level per-IP limits (already built). |
| Neon (Free) | **Yes** | Free plan never bills; at its limit compute suspends (outage, not a bill). On Launch: no hard cap, alerts only. |
| Resend (Free) | **Yes** | Stops sending at 3,000/month (outage of email, not a bill). |
| AI support | **Yes** | Hard monthly budget enforced in code ($1 on staging, $5 default). |
| Stripe fees | No (proportional to revenue) | — |
| Cloudflare account total | **No native hard cap** | Budget alerts (email) at $15, $30 and $60; Cloudflare also creates a $10 alert by default. Plus a daily job in our ops package that reads Cloudflare's billable-usage API and, above a threshold, lowers `max_instances`/pauses non-essential crons and raises a critical incident. |

**Maximum practical exposure** with max_instances = 2 per app, rate-limit rules on, Neon/Resend on free plans: **≈ $130/month**, and only if all six instances run flat out all month. Normal launch months: **≈ $10**.

## 6. Names and domains (verified 2026-11-12)

| Product | Domain | Registry check |
|---|---|---|
| ChangeKite | changekite.com | registrar Cloudflare, Inc.; expires 2027-11-11; Cloudflare nameservers |
| GridRinse | gridrinse.com | registrar Cloudflare, Inc.; expires 2027-11-12; Cloudflare nameservers |
| WebhookTrail | webhooktrail.com | registrar Cloudflare, Inc.; expires 2027-11-12; Cloudflare nameservers |

The code contains no old names, misspellings or other domain variants; each app takes its domain from the `APP_URL` setting.

## 7. Recommendation

**Pay the $5 Cloudflare Workers Paid plan.** No free host can run all three apps without a rewrite (ChangeKite) or the risk that one busy month pauses every site on the account (Netlify). With scale-to-zero, the expected bill is **≈ $10/month at launch and ≈ $16 at 100 users**, the compute cost is effectively capped by instance limits (worst case ≈ $130), and hosting sits next to the domains you already bought. Google Cloud Run could save about $5–10/month at launch but adds another provider and billing account; it is a reasonable fallback, not a better default.
