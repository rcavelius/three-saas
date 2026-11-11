---
title: Security and privacy: what is stored and what is not
slug: security-and-privacy
summary: Your files are cleaned in your browser and never uploaded. Here is what DataPolish stores for accounts, what stays on your device, and how it is protected.
category: Privacy & data
updated: 2026-11-11
---
## Your files are never uploaded

On every plan, with or without an account, DataPolish works inside your web browser:

- When you choose or drop a file, your browser reads it from your disk into the page's memory.
- Parsing and cleaning run in a background thread of the page (a Web Worker) on your computer.
- Downloads, including ZIP files for batches, are created in your browser and saved straight to your computer.
- When you close or reload the tab, the file and results are gone from memory.

We never receive your files, their names, their contents or the cleaned results, so we cannot store them. The site also tells your browser to block the page from sending data to any other server (a Content-Security-Policy with `connect-src 'self'`), and our server has no endpoint that accepts files. You can check this yourself in your browser's developer tools: on the Network tab, opening and cleaning a file makes no request containing its data.

DataPolish uses no AI. Every cleaning step is a fixed rule that runs on your device.

## What an account stores

Accounts are optional. If you create one, we store:

- your name, email address and a hash of your password (never the password itself)
- active sign-in sessions, with the IP address and browser description of each, so you can review and sign out devices on the [Account](/account) page
- your workspace, its members and invitations
- saved workflows: the list of cleaning steps and the settings you typed, such as column names and find & replace text, stored as typed. Find & replace values are limited to 1 KB so workflows cannot be used to store cell data
- billing status (plan, Stripe customer and subscription ids). Card details are handled by Stripe and never reach us

## Usage statistics

We count page views and feature use with our own first-party counter, without cookies or third parties. An event records the page path and a few fixed values, such as "batch mode, 3 files, ZIP download". It never includes file names, column names or cell contents, and your IP address is not stored with it. Events are kept for 13 months. There are no third-party analytics or advertising trackers.

## What is stored on your device

- Workflows you save "in this browser", in local storage
- A random identifier for the usage counter
- A session cookie if you sign in

You can clear all of it from your browser's site data settings.

## How accounts are protected

- Passwords must be at least 10 characters and are stored only as a hash.
- Sessions use secure, http-only cookies. You can sign out a single device or **Sign out everywhere** on the [Account](/account) page.
- Changing your password signs out your other devices. Resetting it signs you out everywhere.
- Every request for saved workflows is checked against your workspace.
- Payments are handled by Stripe; we never see card numbers.

## Deleting your data

Deleting your account removes your login, sessions, profile, the workspaces you own alone and their workflows immediately. See [Deleting your account](/help/delete-account).

For the full policy, read the [privacy page](/privacy). To report a security issue or make a data request, [contact support](/support).
