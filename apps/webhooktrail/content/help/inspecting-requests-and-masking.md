---
title: Inspecting requests and masked secrets
slug: inspecting-requests-and-masking
summary: What the inspector stores and shows for each request, how to search and filter, and how secrets are masked until you reveal them.
category: Getting started
updated: 2026-11-11
---
The inspector at `/e/<id>` lists every captured request for an endpoint, newest first. Click a request to see its details.

## What is stored for each request

- Method, path (everything after the slug, still percent-encoded) and the raw query string.
- Headers. Names are lower-cased and listed alphabetically by the runtime, so the original order and casing are not kept. WebhookTrail's own cookies (its session and owner cookies) are removed.
- The body, up to your plan's stored size (256 KB on Free, 1 MB on Developer, 5 MB on Pro). Anything beyond that is dropped and the request is marked as truncated. The full body size is still recorded.
- Content type, the sender's IP address and the time received.

## Viewing the body

Depending on the content, the body viewer offers a **JSON tree**, **Form fields** (for form-encoded bodies) or **Text** view, plus **Raw** and **Hex**. Binary bodies are shown in hex. If a body says it is JSON but cannot be parsed, the inspector shows the parse error and the raw text.

## Search and filter

You can filter the list by method, by time range, and with a search (up to 200 characters) across the path, query, headers and body. You can delete a single request or all requests of the endpoint.

## Masking of sensitive data

Secrets are hidden by default in the inspector, in **Copy as cURL** and in the replay preview. WebhookTrail masks:

- Sensitive headers such as `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`, and headers ending in things like `-Token`, `-Secret`, `-Signature`, `-Password` or `-Session`. For `Authorization` the scheme (for example `Bearer`) stays visible; for cookies the cookie names stay visible.
- Query parameters whose names end in words like `token`, `secret`, `signature`, `password`, `key`, `auth`, `session` or `code`.
- JSON and form fields with secret-like names, such as `password`, `client_secret`, `accessToken`, `api_key`, `authorization`, `card_number`, `cvv` or `ssn`.
- Anything that looks like a payment card number (13 to 19 digits that pass the Luhn check).

Masked values show as `••••••••`. You can reveal a single header or query value, or use **Reveal secrets** to show everything in the current view. While secrets are masked, the hex view is hidden because it would show the raw bytes. **Copy as cURL** copies the masked version unless you have revealed secrets, in which case it is labelled **Copy as cURL (with secrets)**.

Masking only changes what is displayed. The request is stored exactly as it was received, so avoid sending real production secrets to a capture URL, and delete them when you are done.

## Related

- [Replay and destinations](/help/replay-and-destinations)
- [Security and privacy](/help/security-and-privacy)
