---
title: Security, privacy and data retention
slug: security-and-privacy
summary: What ChangeKite stores about scans and accounts, who can see reports, how long data is kept, and how sign-in sessions are protected.
category: Privacy & data
updated: 2026-11-11
---
This article summarises what ChangeKite stores and for how long. The full text is in the [privacy policy](/privacy).

## Free scans

- We store the address you entered and the report produced from the public pages of that site.
- No account is needed, no cookies are set for a free scan, and the scan record does not store your IP address. For rate limiting, a one-way hash of your IP address is kept in a counter for the current hour.
- Each report lives under a long random link. Anyone with the link can open it, so share it with care.
- Free reports are deleted automatically after the retention period, 90 days by default.

## Accounts

- Your email address, name and a salted password hash, plus the workspaces you belong to and your role in each.
- For each signed-in session: a session cookie (httpOnly), the time, your browser's user agent and the IP address, so you can review and end sessions yourself.
- Monitored site addresses, their scan reports, issue history and alert settings.
- A record of the emails we send you (confirmation, password reset, invitations, alerts, billing notices) and their status.

## Who can see what

- Reports of monitored sites can be opened only by members of your workspace. Anyone else, including someone who has the link, gets "not found".
- Free one-off reports can be opened by anyone with the link.
- Alert emails go only to members of your workspace.

## How long data is kept

- **Free report links**: 90 days by default.
- **Monitoring scan history**: as long as your plan includes, 90 days on Solo and 365 days on Agency. The latest scan of each site is always kept while the site is monitored.
- **Removing a site** deletes its scan history and alerts.
- **Deleting your account** removes your login, sessions and the workspaces you own alone, with their sites, reports and alerts, immediately. See [Deleting your account](/help/delete-your-account).

## Payments

Card payments are handled by Stripe on its own pages. We store the Stripe customer and subscription identifiers, the plan and its status. We never receive card numbers.

## Product analytics

Page views and a few product events are recorded on our own server, with a random identifier kept in your browser's local storage and, when signed in, your user id. IP addresses are not stored with these events, and no third-party analytics or advertising scripts are used.

## Keeping your account secure

- Passwords must be at least 10 characters.
- On [Account](/account), under **Signed-in devices**, you can see every session and sign out any device, all other devices, or everywhere.
- Changing your password signs out your other devices. Resetting a forgotten password signs out all sessions.
- Sessions last up to 30 days and are extended while you use ChangeKite.
- Sign-in, sign-up and password reset attempts are rate limited to slow down guessing.

ChangeKiteBot only reads public pages and obeys robots.txt; see the [ChangeKiteBot page](/bot).

## Privacy requests and security reports

To ask for a copy or deletion of your data, or to report a security issue, open a ticket from [Support](/support). These are handled by a person.
