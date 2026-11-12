---
title: Anonymous endpoints and claiming them into your workspace
slug: anonymous-and-claimed-endpoints
summary: Endpoints made without an account belong to the browser that created them. Sign up or log in to claim them into your workspace.
category: Getting started
updated: 2026-11-11
---
WebhookTrail works without an account, but anonymous endpoints have some limits. This article explains how ownership works and how to move endpoints into your workspace.

## Anonymous endpoints

When you create an endpoint without being signed in, WebhookTrail sets a cookie called `wt_owner` in your browser. It holds a random token; WebhookTrail stores only a SHA-256 hash of it. The cookie lasts 30 days.

- Only the browser with that cookie can see the endpoint and its requests. If you open the inspector link in another browser, on another device, or after clearing cookies, the endpoint will not be found.
- Anonymous endpoints use the Free plan: up to 3 active endpoints per browser, 3,000 captured requests per month, the newest 100 requests kept per endpoint, 1 day of history.
- They expire 24 hours after creation. You can change the expiry to 1 to 24 hours from now, but never beyond 7 days after the endpoint was created.
- Replay is not available for anonymous endpoints.

## Workspace endpoints

With an account, endpoints belong to your workspace. Every member of the workspace sees them, they follow the workspace's plan, and on paid plans they never expire.

## Claim your anonymous endpoints

1. Sign up at [/signup](/signup) (or log in at [/login](/login)) in the same browser where you created the endpoints.
2. If you just signed up, confirm your email address first.
3. Open the [dashboard](/app) or the endpoint's inspector and click **Claim my anonymous endpoints into my workspace**.

What claiming does:

- It moves only the endpoints that match this browser's `wt_owner` cookie. Endpoints from other browsers cannot be claimed from here.
- Endpoints are claimed oldest first, up to your plan's endpoint limit. Any that do not fit stay anonymous, and WebhookTrail tells you how many were skipped.
- Expired endpoints are not claimed.
- Claimed endpoints keep their capture URL and captured requests, and take on your workspace's plan. On a paid plan they stop expiring.

## Tips

- If an endpoint "disappeared", check that you are in the browser that created it. Anonymous endpoints are tied to that browser only.
- To keep endpoints for longer than 7 days, claim them into a workspace on a paid plan. See [Plans and limits](/help/plans-and-limits).
