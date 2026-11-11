---
title: Getting started with HookPilot
slug: getting-started
summary: Create a capture URL in one click, send it a test request, and watch the request appear in the live inspector.
category: Getting started
updated: 2026-11-11
---
HookPilot gives you a private URL that records every HTTP request sent to it, and a console (the inspector) where you can read each request's headers, query string and body. You do not need an account to start.

## Create an endpoint

1. Open the [home page](/) and click the button to create an endpoint.
2. You land in the inspector for your new endpoint, with its capture URL and a ready-to-paste `curl` command.
3. Copy the capture URL. It looks like `https://<host>/h/<slug>`, where the slug is 24 random URL-safe characters.

Treat the capture URL like a secret: anyone who knows it can send requests to it. It never reveals stored data, though. It only answers with the endpoint's configured response.

## Send a test request

You can send anything to the capture URL, including any sub-path and query string after the slug. For example:

```
curl -X POST 'https://<host>/h/<slug>/orders?attempt=1' \
  -H 'Content-Type: application/json' \
  -d '{"type":"order.created","id":"ord_1042"}'
```

By default the URL answers `200` with `{"ok":true,"id":"<request id>"}`. The same id is in the `X-HookPilot-Request-Id` response header.

The inspector also has a **Send a test payload** panel with ready-made samples (a JSON event with a signature header, a form body, a plain-text body, an oversized body and a broken JSON body). These are sent from your browser to your own capture URL, so they are real captures.

Accepted methods are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` and `OPTIONS`. Any other method gets `405`.

## Watch it arrive

The inspector checks for new requests every 2 seconds while the tab is visible. When the tab is hidden, or you pause live updates, it stops polling and catches up when you come back. You can also refresh by hand.

## Point a real webhook at it

Paste the capture URL into the webhook settings of the service you are testing (Stripe, GitHub, your CI, your own service). Each delivery shows up in the inspector.

## Choose what the URL answers

In the endpoint settings you can set a custom response to test how a sender handles errors:

- Status code from 200 to 599 (204, 205 and 304 must have an empty body).
- Content type `application/json` (must be valid JSON) or `text/plain`. Other types are refused.
- Body of at most 4 KB. An empty JSON body sends the default response.

## Next steps

- Without an account, your endpoint belongs to this browser and expires. See [Anonymous and claimed endpoints](/help/anonymous-and-claimed-endpoints).
- Learn what the inspector shows in [Inspecting requests and masked secrets](/help/inspecting-requests-and-masking).
- Check the limits of each plan in [Plans and limits](/help/plans-and-limits).
