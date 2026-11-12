# Launch checklist (updated 2026-11-12)

## 1. Where things stand
All three products run on their own domains on Cloudflare, **behind a site password** (not public yet; password in `.secrets/SITE-PASSWORD.txt` on your PC, any username):

| Product | URL | Verified on the live domain |
|---|---|---|
| GridRinse | https://gridrinse.com | health ok (database, scheduler, queue), all main pages 200, Stripe test webhook endpoint reachable and signature-checked |
| ChangeKite | https://changekite.com | health ok, main pages 200, real scan of example.com in 2.5 s |
| WebhookTrail | https://webhooktrail.com | health ok, main pages 200, capture URL accepts webhooks without the password |

Not yet verified on the new domains: sign-up email delivery (waits on step 2.1), and a full Stripe test checkout on gridrinse.com (needs a verified account, so also waits on 2.1).

## 2. What needs you
1. **Turn on email sending for the three domains** (one click each): Cloudflare → Email Service → Email Sending → Onboard Domain → pick the domain → Continue → **Activate**. It adds sending records (SPF/DKIM on `cf-bounce.<domain>`, DMARC). Included in the Workers Paid plan (3,000 emails/month, then $0.35 per 1,000). Until then, sign-up and alert emails wait in each app's outbox and retry.
2. **Approve going public**, per product, when you are happy with it. Then I remove the site password.
3. **Live payments**: Stripe identity/business verification and bank account, then your go-ahead to switch GridRinse (and later the others) from test mode.
4. Legal review of the privacy policy and terms.
5. Optional: AI chat in the help center needs an Anthropic API key (budget-capped in code at $5/month per app). Without it, the help center answers with article search.

## 3. Running costs
| Item | Cost |
|---|---|
| Cloudflare Workers Paid (hosting, email, cron) | $5/month + container usage (expected ≈ $5–10/month at launch with sleep-when-idle) |
| Neon Postgres | free plan |
| Domains | $33.51/year (paid) |
| Stripe | fees per sale only (test mode now) |

Budget alerts email you at $10, $15, $30 and $60 of Cloudflare spend. Each app is capped at one `basic` container.

## 4. Product names and domains
ChangeKite, GridRinse and WebhookTrail were formerly named SiteProof, DataPolish and HookPilot; renamed on 2026-11-11 because of trademark and domain conflicts. Domains are registered at Cloudflare until November 2027.

The old Netlify staging site (gridrinse-staging) is no longer needed and can be deleted once you have looked at the new domain.
