# Operating cost model

**Planning estimates, not quotes.** Unit prices below are list prices as last known (late 2026) and must be re-checked on each provider's pricing page at signup. Once running, actual costs are recorded in `cost_entries` and the owner dashboard reports those instead of these estimates.

## Unit prices assumed

| Item | Assumed price | Notes |
|---|---|---|
| Fly.io shared-cpu-1x, 512 MB, always on | ~$3.20/mo | 1x/1 GB ~$5.70, 2x/1 GB ~$11, performance-1x/2 GB ~$31 |
| Fly.io outbound bandwidth (NA/EU) | ~$0.02/GB | inbound free |
| Neon Postgres | Free tier; paid ~$19/mo base or usage (~$0.14/compute-hour, ~$0.35/GB-month storage) | one project, three databases |
| Resend email | Free: 3,000/mo (100/day); Pro ~$20/mo for 50,000 | |
| Stripe | 2.9% + 30¢ per card charge, plus ~0.7% Stripe Billing | US cards; international cards cost more |
| Domains | ~$12/yr each | |
| AI support (small model) | ~$0.002–0.01 per answered question | hard-capped monthly budget |
| Error tracking / uptime | $0 (free tiers) | Sentry developer, Better Stack or UptimeRobot |

## Workload assumptions per paying customer

| App | Plan mix assumed | Load per paying customer | Free users |
|---|---|---|---|
| SiteProof | 70% Solo, 30% Agency | Solo ~2 sites, Agency ~10 sites in use; daily scan, avg 150 pages × 120 KB fetched | ~20 free one-off scans per paying customer per month (25 pages each) |
| DataPolish | 70% Pro, 30% Business | Processing is in the browser: server load is auth, billing and saved workflows only (~5 KB/user) | static page views |
| WebhookTrail | 70% Developer, 30% Pro | ~15k captured requests/mo avg, 4 KB avg stored, 7-day (Dev) / 30-day (Pro) history | ~100 requests per free endpoint, 24 h retention |

Emails: ~4 lifecycle emails per customer per month, plus SiteProof change alerts (deduplicated, ~4/mo) and owner alerts (few).

## Monthly cost by scale (per app)

### 0 paying customers (launch)

| | SiteProof | DataPolish | WebhookTrail |
|---|---|---|---|
| Compute | $5.70 (1x/1 GB) | $3.20 | $3.20 |
| Database | $0 (Neon free) | $0 | $0 |
| Bandwidth | <$1 | <$1 | <$1 |
| Email | $0 | $0 | $0 |
| Domain | $1 | $1 | $1 |
| **Total** | **~$8** | **~$5** | **~$5** |

All three: **~$18/month** (+ optional AI support budget, capped at $5).

### 100 paying customers each

| | SiteProof | DataPolish | WebhookTrail |
|---|---|---|---|
| MRR (plan mix above) | $3,700 | $1,710 | $1,500 |
| Compute | $11 (1 web) + $11 (1 scan worker) | $3.20 | $5.70 |
| Crawl / ingest volume | ~450 sites × 150 pages/day ≈ 2M fetches, ~240 GB inbound (free) | — | ~1.5M requests, ~6 GB stored |
| Database | ~3 GB → ~$19 | ~$0–19 | ~6 GB + write load → ~$19–25 |
| Bandwidth out | ~$2 | ~$1 | ~$2 |
| Email (~800–1,200/mo) | shared Resend free tier → $0 (Pro $20 if limits hit) | | |
| Stripe fees (~3.9% + 30¢) | ~$175 | ~$97 | ~$89 |
| **Total cost** | **~$220** | **~$105** | **~$120** |
| **Contribution** | **~$3,480** | **~$1,605** | **~$1,380** |

### 1,000 paying customers each

| | SiteProof | DataPolish | WebhookTrail |
|---|---|---|---|
| MRR | $37,000 | $17,100 | $15,000 |
| Compute | 2 web ($22) + 4 scan workers perf-1x/2 GB ($124) | 2 × 1 GB ($11) | 3 × 1 GB ($17) |
| Volume | ~20M fetches/day-equivalent month, ~2.4 TB inbound | — | ~15M requests/mo (~6/s avg, bursts 100/s) |
| Database | ~30 GB, higher compute → ~$100–150 | ~$19 | ~60 GB → ~$120–180 |
| Bandwidth out | ~$15 | ~$5 | ~$15 |
| Email (~12k/app/mo, ~36k total) | Resend Pro $20 shared | | |
| Monitoring (paid tiers likely) | ~$30 shared | | |
| Stripe fees | ~$1,740 | ~$967 | ~$885 |
| **Total cost** | **~$2,050** | **~$1,010** | **~$1,100** |

At 1,000 customers each, human operator time (support escalations, disputes, abuse) becomes the main non-Stripe cost: budget roughly 10–20 contracted hours per month across the three products.

## Budget alerts and ceilings (configured in code and at providers)

- Provider-side: spend alerts in Fly.io (organisation billing alerts), Neon (usage notifications), Resend, Stripe Radar rules, AI provider monthly limit.
- App-side (`@repo/ops` budgets): monthly budget per provider in `ops_budgets`; warning at 80%, critical incident (owner email) at 100%.
- Usage ceilings (owner-tunable env vars, enforced in code): SiteProof max concurrent scans and pages per scan per plan; WebhookTrail max stored requests per endpoint, payload caps, monthly request quota per plan, global rows ceiling incident; DataPolish file-size and row caps per plan (in-browser).
