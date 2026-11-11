---
title: Monitoring sites and email alerts
slug: monitoring-and-alerts
summary: How scheduled re-scans, Scan now, alert emails, muting, pausing and unreachable sites work on the Solo and Agency plans.
category: Getting started
updated: 2026-11-11
---
Monitoring is part of the paid plans. SiteProof re-scans each monitored site on a schedule and emails you when something meaningful changes. You manage it from [Monitored sites](/dashboard).

## Schedule

- **Solo**: each site is re-scanned every 24 hours, up to 250 pages per scan.
- **Agency**: every 6 hours, up to 1,000 pages per scan, with priority in the scan queue.

The dashboard shows each site's status, score, score trend, open critical issues and warnings, and the last and next scan time. Open a site to see its open issues, what changed since the previous scan, scan history and recent alerts.

## Scan now

On a site's page, **Scan now** queues an extra scan straight away. Manual scans are limited to 3 per site per hour, and a paused site has to be resumed first. Results appear after a few minutes.

## When you get an email

The first scan of a new site is a silent baseline. After that, SiteProof emails only when something meaningful changes:

- the site goes down, or comes back up
- the home page starts or stops returning an error
- new critical issues appear
- new broken internal links appear
- the certificate becomes invalid, expires, or will expire in less than 14 days
- robots.txt starts blocking the whole site
- the score drops by 10 points or more

Each change produces one email. An issue that stays open is not re-alerted on every scan. When critical issues clear, you get a separate "fixed" email.

## Who receives alerts

On a site's page, under *Alert emails go to*, tick the workspace members who should receive alerts. If nobody is ticked, alerts go to every verified member of the workspace. Recipients must be members of the workspace; this is checked again when each email is sent.

## Mute, pause or remove

Owners and admins can change these settings on the site's page:

- **Mute alerts**: scans continue, but no alert emails are sent for this site.
- **Pause monitoring**: scheduled scans stop until you resume.
- **Remove site**: stops monitoring and deletes the site's scan history and alerts. This cannot be undone.

## Unreachable sites

If a scan fails, it is retried. After three failures in a row the site is marked *unreachable* and you get one "Site unreachable" email. Monitoring continues, and you get a "back up" email when a scan succeeds again. While a site is down, or while robots.txt shuts SiteProofBot out, open issues are kept as they were rather than being marked resolved.

## Scan history

Scans are kept for your plan's history period (90 days on Solo, 365 days on Agency). The latest scan of each site is always kept while the site is monitored.
