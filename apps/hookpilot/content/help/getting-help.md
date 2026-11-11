---
title: Getting help, docs and guides
slug: getting-help
summary: Where to find the HookPilot reference docs and guides, how the support assistant works, and when to open a ticket for a person.
category: Getting help
updated: 2026-11-11
---
## Documentation

The [documentation](/docs) is the technical reference for what HookPilot implements:

- The capture URL format and what is stored per request
- A plan limits table
- Every capture response code (`404`, `405`, `410`, `413`, `423`, `429`) and its meaning
- Custom responses
- Accounts, ownership and privacy
- The inspection API (`/api/endpoints`, requests, replay and destinations), with list parameters and live polling
- Replay rules and destination verification
- API error codes

## Guides

The [guides](/guides) are step-by-step walkthroughs:

- [Verify Stripe webhook signatures](/guides/verify-stripe-webhook-signatures): how the `Stripe-Signature` header is built and why the raw body matters.
- [Verify GitHub webhook signatures](/guides/verify-github-webhook-signatures): checking `X-Hub-Signature-256` with your webhook secret.
- [Test your webhook receiver's retries and idempotency with replay](/guides/test-webhook-retries-with-replay): capture a real webhook, verify your staging receiver and replay it.

## Help center

The [help center](/help) has articles on getting started, plans, billing, accounts, data and troubleshooting. A good first stop is [Troubleshooting common problems](/help/troubleshooting).

## Support

Go to [/support](/support).

**The support assistant** answers questions about how HookPilot works, using the help center articles. It is quick for questions like "why did my capture URL answer 423?" or "how do I verify a destination?". It cannot see your account, change your plan or issue refunds.

**Open a ticket** when you need a person. You can follow your tickets at [/support/tickets](/support/tickets). A person handles:

- Refund requests
- Billing disputes
- Security reports
- Legal questions
- Data requests about your personal data
- Problems the help center and assistant could not solve

When you open a ticket, include what you did, what you expected, what happened, and any status code or error message (for example `quota_exceeded` or `destination_not_verified`). Do not paste passwords, API keys or other secrets into a ticket.

## Things you can do yourself

- Change plan, update your card or cancel: [/account/billing](/account/billing) (workspace owner only).
- Manage your team: [/account/team](/account/team).
- Change your password, manage sessions or delete your account: [/account](/account).
- Reset a forgotten password: [/forgot-password](/forgot-password).
