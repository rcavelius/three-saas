---
title: Troubleshooting common problems
slug: troubleshooting
summary: Fixes for scans that are refused or limited, unreachable or blocked sites, missing confirmation emails, and sign-in problems.
category: Troubleshooting
updated: 2026-11-11
---
## A scan is refused before it starts

ChangeKite only scans public websites. You will see an error if the address:

- does not start with `http://` or `https://` (other schemes are refused)
- uses a port other than 80 or 443
- contains a username or password, such as `https://user:pass@example.com`
- points to a local, internal or private network address, or resolves to one

Enter the public address of the site, for example `yourdomain.com`.

## "Free scans are limited to 5 per hour"

Free scans are limited per connection, 5 per hour by default. The message tells you how many minutes to wait. People sharing one office or network share this limit.

## "This website has been scanned many times in the last hour"

Each website can only be scanned a limited number of times per hour, no matter who asks (10 by default), so ChangeKite cannot be used to flood a server. Try again later.

## "All scanners are busy right now"

Too many scans are running. Wait a minute and retry.

## The report is short or says pages were not checked

Free scans stop at 25 pages, three clicks deep, or about 45 seconds. Look at **Crawl coverage** in the report to see what was skipped. Pages that robots.txt disallows for ChangeKiteBot are never requested.

## robots.txt is blocking ChangeKite

ChangeKiteBot obeys robots.txt. If your file contains `Disallow: /` for `*` or for ChangeKiteBot, very little can be checked. A `Crawl-delay` is honoured up to 5 seconds, which makes the scan slower. See the [ChangeKiteBot page](/bot) and the guide [Is robots.txt blocking your whole site?](/guides/robots-txt-blocking-search-engines).

## External links show "could not verify"

Many large sites block automated requests with 403 or 429. These are reported as "could not verify", not broken.

## A monitored site shows "unreachable"

After three failed scans in a row a site is marked unreachable and you get one email. Check that the site loads publicly and that your firewall or hosting does not block ChangeKiteBot. Monitoring continues, and you get an email when it is back.

## "Scan now" does not work

- Manual scans are limited to 3 per site per hour.
- A paused site must be resumed first.
- A site paused because your plan allows fewer sites resumes when you upgrade or remove another site.

## The confirmation email has not arrived

- Wait a few minutes and check your spam folder.
- The link is valid for one hour. If it expired, request a new one on [Confirm your email](/verify-email), or try to [log in](/login) and choose **Send a new link**.
- New links can be requested a few times every 5 minutes.

## I cannot log in

- **"That email and password do not match."** Check the address, or reset your password from [Forgot your password?](/forgot-password). The reset link is valid for one hour.
- **"Please confirm your email address first."** Open the confirmation link, or send a new one from the login page.
- After several failed attempts, sign-in is blocked for a short time. Wait a minute and try again.

## Checkout says payments are not switched on

Online payments are not available on this server yet. Nothing is charged, and every free feature still works.

## Still stuck?

Go to [Support](/support) to ask the assistant or open a ticket.
