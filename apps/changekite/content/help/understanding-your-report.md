---
title: Understanding your report and score
slug: understanding-your-report
summary: What the twelve checks in a ChangeKite report cover, how findings are graded critical, warning or notice, and how the score is calculated.
category: Getting started
updated: 2026-11-23
---
Every finding in a ChangeKite report comes from one of a fixed set of checks. The full reference, with exactly how each check works, is on [What we check](/docs). This article is the short version.

## Severity levels

- **Critical**: fix now. Visitors or search engines are affected, for example the start page returns an error, a certificate has expired, or an internal link returns 404.
- **Warning**: should fix, for example a missing meta description, a page title used on several pages, or images without an alt attribute.
- **Notice**: worth knowing, for example a title longer than 60 characters or a link that goes through a redirect.

## The checks

- **HTTPS & certificate**: certificate trust, hostname and expiry, whether `http://` redirects to `https://`, and the HSTS header. Expiring within 14 days is critical, within 30 days a warning.
- **Page status**: the HTTP status of each page and redirect chains.
- **Internal links**: links to your own site that return errors, time out, redirect or need a login.
- **External links**: up to 50 outbound links per scan. Sites that block automated requests (403 or 429) are reported as "could not verify", not as broken.
- **Page titles**: missing, duplicated, too long or too short titles.
- **Meta descriptions**: missing, empty, duplicated, under 50 or over 160 characters.
- **Canonical URLs**: missing, conflicting or broken `rel="canonical"` links.
- **Image alt text**: images with no alt attribute. An empty `alt=""` is correct for decorative images and is never flagged.
- **Mixed content**: `http://` scripts, styles, images or form actions on `https` pages.
- **XML sitemap**: whether a sitemap exists, parses, and lists working URLs on your host.
- **robots.txt**: whether it blocks the whole site, returns a server error, or is missing.
- **Crawl coverage**: what was and was not checked, for example when the page cap or time limit was reached.

A check can show as *Not checked* when the scan could not run it.

## Free report and full report

The free report shows the score, every check's result with counts by severity, the number of pages read, and the 3 most severe findings with how to fix them. The full report lists every finding with the page it is on and the fix, plus the page-by-page list. It is included in the Solo and Agency plans, or unlocked for 7 days with the one-time Full-site report pass ($9, no account needed). See [Plans and limits](/help/plans-and-limits).

## How the score works

The score starts at 100 and goes down for each finding:

- 10 points per critical finding, at most 60 in total
- 3 points per warning, at most 30 in total
- 1 point per notice, at most 10 in total

The caps stop one noisy category from hiding everything else. The score never goes below 0.

The report also gives a short verdict:

- **In good order**: 85 or more and no critical findings.
- **Needs attention**: 60 or more.
- **Serious problems**: below 60.

The score is a summary of one scan. It is not a search ranking factor and not a promise about search results.

## Fixing common findings

The [guides](/guides) walk through the most common problems step by step, including broken internal links, certificate expiry and a robots.txt that blocks your whole site.
