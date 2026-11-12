---
title: Saving and reusing workflows
slug: saved-workflows
summary: Save your cleaning steps as a workflow in this browser, as a JSON file, or in your account on Pro and Business, and apply it to next month's file.
category: Getting started
updated: 2026-11-11
---
A workflow is your list of cleaning steps and their settings. It is **not** your data: no file contents are saved. Any literal text you typed into steps, such as find & replace values, column names and separators, is saved with it as typed.

You find workflows in the **Saved workflows** panel below the cleaning steps, once a file is loaded. Type a name (up to 100 characters) and choose where to keep it.

## In this browser (every plan, no account)

- **Save in this browser** keeps the workflow in your browser's local storage on this device.
- **Apply** loads its steps into the cleaner. The × button deletes it.
- If your browser blocks local storage (for example in private mode), you see a message and can use Export instead.

## As a file (every plan)

- **Export as JSON** downloads the workflow as a `.gridrinse.json` file you can keep, back up or send to a colleague.
- **Import JSON…** reads such a file, applies its steps and also saves it in this browser. Files larger than 512 KB are refused.

## In your account (Pro and Business)

Signed in on Pro or Business, you also see **Save to account** and an **In your account** list with a counter such as 3/50.

- **Pro** includes 50 workflows in your account.
- **Business** includes unlimited workflows, shared with everyone in your team.
- **Free** accounts keep workflows in the browser only.

Saving with the same name as an existing account workflow (upper and lower case ignored) updates that workflow. If someone else changed it since you loaded it, you see "This workflow changed since you loaded it. Reload and try again."

To move browser workflows into your account, use the ↑ button next to one, or **Import all to my account**. They stay in the browser too.

On a team, any member can delete workflows they saved themselves; admins and owners can delete any workflow.

### Rules for account workflows

- Up to 50 steps per workflow.
- Find and replace values are limited to 1 KB each, and a whole workflow to 32 KB. This keeps cell data out of our database. If a workflow breaks a rule, it is not saved and the message tells you why.

## After a downgrade

Nothing is deleted when your plan changes. If you have more account workflows than your new plan allows, the newest ones over the limit become **read-only**. You can still apply, export or delete them, but not edit them. Delete some workflows or upgrade to edit them again. Your billing page at [/account/billing](/account/billing) shows how many workflows you have against your limit.

See also [Plans and limits](/help/plans-and-limits) and the guide on [cleaning exports the same way every month](/guides/batch-clean-exports).
