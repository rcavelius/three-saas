---
title: How long HookPilot keeps your data
slug: data-retention
summary: Endpoint expiry, request history per plan, the cleanup job, and how to delete requests and endpoints yourself.
category: Privacy & data
updated: 2026-11-11
---
HookPilot is built for testing and debugging, so captured data is kept only for a limited time.

## Endpoint lifetime

- **Free and anonymous endpoints** expire 24 hours after creation. In the endpoint settings you can set the expiry to 1 to 24 hours from now, but never later than 7 days after the endpoint was created.
- **Endpoints on Developer and Pro** never expire. When a workspace moves to a paid plan, its live endpoints stop expiring.
- An expired endpoint answers `410` (`expired`) and stores nothing. It is then permanently deleted, together with its requests, by the next cleanup run.

## Request history

Two rules decide how many captured requests are kept:

- **History period:** requests older than 1 day (Free), 7 days (Developer) or 30 days (Pro) are deleted.
- **Requests per endpoint:** only the newest 100 (Free), 2,000 (Developer) or 10,000 (Pro) requests are kept. Older ones are removed as new ones arrive.

## The cleanup job

A scheduled cleanup runs every 15 minutes. It permanently deletes expired and deleted endpoints with their requests, and deletes requests older than each workspace's history period. So data may remain for a short time after it passes a limit, until the next run.

## Deleting data yourself

- **One request or all requests:** use the delete actions in the inspector.
- **An endpoint:** delete it from its settings. The capture URL stops working at once and its captured requests are deleted immediately. For workspace endpoints, only owners and admins can delete.
- **Your account:** see [Deleting your account](/help/delete-your-account).

## Paused endpoints

After a downgrade, endpoints over the plan's limit are paused, not deleted. They keep their stored requests, although the history period of the new plan still applies.

## Cancellation

When a paid subscription ends, the workspace moves to the Free plan. Endpoints over the Free limit are paused, and requests older than the Free history (1 day) are removed by the normal cleanup job.

## Logs

Server logs record operational events such as "request captured", the endpoint id, method and size. Request headers, query strings and bodies are not written to logs.

See also [Security and privacy](/help/security-and-privacy) and the [privacy policy](/privacy).
