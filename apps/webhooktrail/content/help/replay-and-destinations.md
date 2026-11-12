---
title: Replay requests to verified destinations
slug: replay-and-destinations
summary: On Developer and Pro, resend a captured request to a destination your workspace has verified, once or with retries.
category: API & integrations
updated: 2026-11-11
---
Replay sends a captured request again to a URL you control, for example your staging receiver. It is available on the Developer and Pro plans, for endpoints that belong to your workspace (anonymous endpoints must be claimed first).

## Step 1: add a destination

Owners and admins add destinations at [/account/destinations](/account/destinations). A workspace can have up to 20 destinations. WebhookTrail refuses URLs that:

- use a port other than 80 or 443,
- point to private, loopback, link-local or cloud metadata addresses,
- contain a username or password, or use special-use names,
- point to WebhookTrail itself.

## Step 2: verify it

A destination must be verified before it can receive replays. When you click verify, WebhookTrail sends:

```
POST <your url>
Content-Type: application/json

{"type":"webhooktrail.verify","challenge":"<random string>"}
```

Your receiver must answer with a 2xx status and echo the challenge in the body, either as the bare string or as `{"challenge":"<challenge>"}`. A redirect, another status or a wrong body leaves it unverified, and the reason is shown. Changing the URL clears the verification. You can try verifying up to 3 times per minute per destination.

```
app.post("/webhooks", express.json(), (req, res) => {
  if (req.body?.type === "webhooktrail.verify") return res.json({ challenge: req.body.challenge });
  res.sendStatus(204);
});
```

## Step 3: replay

Open a request in the inspector, pick a verified destination and choose **Replay once** or a number of attempts with retries.

- The captured method and body are sent to the destination URL exactly. The captured sub-path and query are not added.
- `GET`, `POST`, `PUT`, `PATCH` and `DELETE` can be replayed; `HEAD` and `OPTIONS` cannot. Bodies over 1 MB cannot be replayed.
- Sensitive headers (such as `Authorization`, `Cookie`, `*-Token`, `*-Api-Key`) are left out unless you tick them for that replay. Cookies, `Host`, `Content-Length`, hop-by-hop and forwarding headers are never sent.
- Signature headers such as `Stripe-Signature` or `X-Hub-Signature-256` are sent, but their signed timestamp is probably stale, so your receiver may reject them.
- Each replay adds `X-WebhookTrail-Replay-Id` and `User-Agent: WebhookTrail-Replay/1.0`.
- The preview shows exactly which headers will be sent.

## Retries

With more than one attempt (up to 5), the first is sent at once. If it does not get a 2xx response, the next attempts follow after about 10, 20, 40 and 80 seconds, stopping at the first 2xx. Scheduled attempts are skipped if the destination is deleted, changed or unverified, or the plan no longer includes replay.

## Network protections

Replays and verification only connect to public internet addresses. The address is checked after DNS lookup and the connection is pinned to it. Redirects are never followed (a 3xx is recorded as the result). There is a 15-second timeout, and up to 64 KB of the response is read (the first 4 KB is shown).

## Limits and history

You can send 30 replays per minute per workspace and 10 per minute per destination. Every attempt is recorded in the replay history: who, when, destination, attempt, result, response status and time taken.

See the guide [Test your webhook receiver's retries and idempotency with replay](/guides/test-webhook-retries-with-replay) for a walkthrough.
