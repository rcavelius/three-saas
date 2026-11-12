---
title: Troubleshooting common problems
slug: troubleshooting
summary: Fixes for requests not showing up, 413 payload too large, failed replays, missing verification emails and sign-in problems.
category: Troubleshooting
updated: 2026-11-11
---
Most problems show up as a status code from the capture URL or a message in the inspector. Start there.

## A request is not showing up

Check the status code the sender received:

- **404 `not_found`:** the slug is wrong, or the endpoint was deleted. Copy the capture URL again from the inspector.
- **405 `method_not_allowed`:** only `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` and `OPTIONS` are accepted.
- **410 `expired`:** the endpoint expired. Free endpoints last 24 hours (extendable to 7 days). Create a new one, or use a paid plan where endpoints do not expire.
- **423 `endpoint_paused`:** your workspace has more endpoints than its plan allows. Upgrade or delete another endpoint.
- **429 `rate_limited`:** too many requests per minute. Wait for the time in `Retry-After`.
- **429 `quota_exceeded`:** the monthly request quota is used up. Captures resume on the 1st of next month (UTC) or right after an upgrade.

If the sender got `200` but you do not see the request:

- Make sure live updates are not paused, and click refresh.
- Clear any search, method or time filter.
- Anonymous endpoints are visible only in the browser that created them.
- Old requests are removed after the plan's history period and beyond the newest requests kept per endpoint.

## Payload too large (413)

Bodies over the plan's limit (1 MB Free, 2 MB Developer, 10 MB Pro) are rejected and not stored. Bodies within the limit but larger than the stored size (256 KB, 1 MB, 5 MB) are stored truncated and marked as such.

## Replay is failing

- **Replay not offered:** replay needs Developer or Pro and an endpoint in your workspace. Claim anonymous endpoints first.
- **Destination not verified:** verify it at [/account/destinations](/account/destinations). Your receiver must answer 2xx and echo the challenge. Changing the URL requires verifying again.
- **Destination refused or blocked:** only public addresses on ports 80 or 443 are allowed, never private networks or WebhookTrail itself.
- **3xx result:** redirects are never followed. Use the final URL.
- **Receiver rejects the signature:** signature headers are replayed as captured, and their timestamp is probably stale.
- **Missing auth header:** sensitive headers are only sent if you tick them for that replay.
- **429:** limit of 30 replays per minute per workspace and 10 per destination.
- **Cannot replay:** `HEAD` and `OPTIONS` requests and bodies over 1 MB cannot be replayed.

## The verification email did not arrive

Check your spam folder and that you typed the address correctly. The confirmation link works once and for one hour. If it expired or never arrived, open a ticket from [/support](/support).

## Login problems

- **"Confirm your email first":** open the link from the sign-up email.
- **Forgot password:** use [/forgot-password](/forgot-password). The reset link works for one hour, and resetting signs out your other sessions.
- **Too many attempts:** sign-in and reset requests are rate limited. Wait a few minutes and try again.
- **Signed out unexpectedly:** sessions last up to 30 days and end if the password was changed or a session was revoked.

Still stuck? See [Getting help](/help/getting-help).
