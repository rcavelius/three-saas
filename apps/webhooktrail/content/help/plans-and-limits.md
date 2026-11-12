---
title: Plans and limits
slug: plans-and-limits
summary: Exact limits of the Free, Developer ($9/month) and Pro ($29/month) plans, and what happens when you reach them.
category: Plans & billing
updated: 2026-11-11
---
WebhookTrail has three plans. Prices are in US dollars per month, excluding applicable taxes. Limits are checked on the server for every request. Anonymous endpoints always use the Free plan.

## Free ($0)

- 3 active endpoints
- Endpoints expire after 24 hours (extendable to 7 days after creation)
- 3,000 captured requests per month
- Newest 100 requests kept per endpoint, 1 day of history
- First 256 KB of each body stored; bodies over 1 MB rejected
- Replay: not included
- 1 team seat

## Developer ($9 per month)

- 25 active endpoints
- Endpoints never expire
- 100,000 captured requests per month
- Newest 2,000 requests kept per endpoint, 7 days of history
- First 1 MB of each body stored; bodies over 2 MB rejected
- Replay to verified destinations, with retries
- 1 team seat

## Pro ($29 per month)

- 100 active endpoints
- Endpoints never expire
- 1,000,000 captured requests per month
- Newest 10,000 requests kept per endpoint, 30 days of history
- First 5 MB of each body stored; bodies over 10 MB rejected
- Replay to verified destinations, with retries
- 5 team seats

## Rate limits

To protect the service, each endpoint accepts up to 120 requests per minute on Free, 600 on Developer and 1,200 on Pro. Each client IP can send up to 240 captures per minute, and create at most 10 endpoints per hour. Over a rate limit, the capture URL answers `429` with `rate_limited` and a `Retry-After` header.

## What happens at a limit

- **Monthly quota:** counted per workspace (or per browser for anonymous endpoints) and per calendar month in UTC. When it is used up, capture URLs answer `429` with `quota_exceeded` until the 1st of next month (UTC) or until you upgrade. Owners get one email per month at 80% usage.
- **Payload too large:** bodies over the plan's limit get `413` with `payload_too_large`. They are not stored and do not count toward the quota.
- **Stored body size:** bodies larger than the stored size but within the limit are accepted and stored truncated.
- **Requests kept per endpoint:** the oldest requests are removed as new ones arrive.
- **Endpoint count:** creating more endpoints than the plan allows is refused.

## After a downgrade

If your workspace moves to a plan with fewer endpoints, the extra endpoints are paused, not deleted. The oldest endpoints stay active. A paused endpoint answers `423` (`endpoint_paused`), stores nothing and keeps its history. It resumes after an upgrade, or you can delete another endpoint to make room.

You can see your current usage on the [dashboard](/app) and at [/account/billing](/account/billing). Compare plans on the [pricing page](/pricing).
