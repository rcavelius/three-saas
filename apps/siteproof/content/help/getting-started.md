---
title: Getting started with SiteProof
slug: getting-started
summary: Run your first free scan without an account, then create an account and add a monitored site on a paid plan.
category: Getting started
updated: 2026-11-11
---
SiteProof inspects the public pages of a website and gives you a report: broken links, page titles, meta descriptions, canonical URLs, image alt text, mixed content, your XML sitemap, robots.txt, and HTTPS, certificate and HSTS settings. You can use it in two ways: a free one-off scan, or monitoring on a paid plan.

## Run a free scan

A free scan needs no account.

1. Go to the [home page](/).
2. Enter the address of the site, for example `yourdomain.com`. If you leave out `https://`, SiteProof adds it for you.
3. Start the scan and watch the progress as pages are checked.
4. When it finishes you get a report at its own link, `/report/<id>`.

A free scan follows links on the site you entered for up to 25 pages and three clicks deep, and stops after about 45 seconds. Anything it did not reach is listed in the report under *Crawl coverage*, so a clean report is never mistaken for a complete one.

The report link is long and random. Anyone you share it with can open it, and it expires automatically after the retention period (90 days by default). From the report you can copy the link, download the data as JSON, or print it to PDF from your browser.

## Create an account

1. Go to [Sign up](/signup) and enter your name, email and a password of at least 10 characters.
2. Open the confirmation link we email you. It is valid for one hour.
3. Once confirmed you are signed in, and a personal workspace is created for you with you as its owner.

An account on the Free plan does not add monitoring by itself: free scans stay on the home page, and monitoring needs the Solo or Agency plan. See [Plans and limits](/help/plans-and-limits).

## Add your first monitored site

On a paid plan:

1. Open [Monitored sites](/dashboard).
2. Enter the address under *Website to monitor* and choose **Add site**. Only workspace owners and admins can add sites.
3. The first scan starts within a few minutes. After that SiteProof re-scans on your plan's schedule (every 24 hours on Solo, every 6 hours on Agency).

The first scan of a site is a quiet baseline: you get alert emails only when something changes after it. See [Monitoring and alerts](/help/monitoring-and-alerts).

## Next steps

- Learn what each finding means in [Understanding your report and score](/help/understanding-your-report).
- Read the full check reference on [What we check](/docs) and the practical [guides](/guides).
