---
title: Security and privacy in HookPilot
slug: security-and-privacy
summary: How capture URLs, access to captured data, sign-in sessions, secret masking and replay are protected, and where to read the privacy policy.
category: Account & security
updated: 2026-11-11
---
HookPilot stores whatever is sent to your capture URLs, which can include credentials or personal data. Here is how that data is protected.

## Capture URLs

- Each capture URL contains a 24-character slug with 144 random bits, so it cannot be guessed. Anyone who has the URL can send to it, so keep it private.
- Capture URLs need no sign-in and never reveal stored data. They only answer with the endpoint's configured response.
- Capturing never fetches or forwards anything. Only an explicit replay sends a request out.
- Responses from capture URLs are only ever JSON or plain text, with headers that stop browsers from running them as a page.

## Who can see captured requests

- Workspace endpoints: only members of that workspace, while signed in.
- Anonymous endpoints: only the browser holding the matching `hp_owner` cookie. HookPilot stores only a hash of that cookie's token.
- Everyone else gets "not found", even for endpoints that exist.

## Secrets in the inspector

Sensitive headers, query parameters, secret-looking JSON and form fields, and card numbers are masked by default in the inspector, in **Copy as cURL** and in the replay preview. You choose when to reveal them. Masking only affects what is shown; the stored request is unchanged. See [Inspecting requests and masked secrets](/help/inspecting-requests-and-masking).

## Replay protections

Replays only go to destinations your workspace has verified with a challenge. They connect only to public internet addresses on ports 80 and 443, never to private networks, cloud metadata addresses or HookPilot itself, and they never follow redirects. Sensitive headers are left out unless you tick them for that replay. See [Replay requests to verified destinations](/help/replay-and-destinations).

## Accounts and sessions

- Passwords must be 10 to 128 characters. New accounts must confirm their email address before signing in.
- Sign-in sessions last up to 30 days. At [/account](/account) you can see your sessions, revoke one, or sign out all other sessions.
- Changing your password signs out your other sessions. Resetting it by email signs out every other session.
- Sign-in, sign-up, password reset and similar actions are rate limited.

## Logs and cookies

Server logs do not contain request headers, query strings or bodies. HookPilot sets the `hp_owner` cookie to give you access to anonymous endpoints, plus sign-in session cookies when you have an account.

## Your responsibility

Use capture URLs for testing integrations you are allowed to test. Avoid sending real production secrets or personal data, and delete them when you are done. See the [terms](/terms).

## Privacy policy and security reports

Read the [privacy policy](/privacy) for what is stored and how long it is kept, and [How long HookPilot keeps your data](/help/data-retention). To report a security issue or make a data request, open a ticket from [/support](/support); a person handles these.
