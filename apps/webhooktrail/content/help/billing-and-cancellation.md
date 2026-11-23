---
title: Billing, plan changes and cancellation
slug: billing-and-cancellation
summary: Upgrade, change plans, update your card or cancel in the Stripe billing portal from /account/billing. Refunds are reviewed by a person.
category: Plans & billing
updated: 2026-11-23
---
Paid plans are monthly subscriptions in US dollars, charged by Stripe. Taxes may apply. Billing belongs to a workspace, and only the workspace **owner** can change the plan or payment details. Admins and members see the plan and usage but cannot change them.

## Upgrade

1. Go to [/account/billing](/account/billing) (or the [pricing page](/pricing)) while signed in as the owner.
2. Choose **Upgrade to Developer** or **Upgrade to Pro**.
3. Complete checkout with Stripe.

The new plan applies as soon as Stripe confirms the payment, usually within seconds. If the billing page has not changed yet, refresh it. If you cancel checkout, nothing is charged.

When you upgrade, endpoints that were paused by a plan limit are unpaused as far as the new limit allows, and live endpoints stop expiring.

## Change plan, update card, view billing

On a paid plan, the billing page shows a button that opens Stripe's billing portal. In the portal you can switch plans, update your card and cancel.

## Cancel

Cancel in the billing portal. Your plan stays active until the end of the period you paid for; the billing page shows the date it ends. After that:

- The workspace moves to the Free plan.
- Endpoints over the Free limit of 3 are paused, not deleted. The oldest stay active.
- Requests older than the Free history period (1 day) are removed by the normal cleanup job.

## Failed payments

If a payment fails, the billing page shows a warning and a date until which you keep your plan. Update your card in the billing portal before then. After that date the workspace moves to Free, and endpoints over the Free limit are paused (not deleted).

## Refunds

If you were charged in error, or WebhookTrail did not work for you in your first 14 days of a paid plan, contact us within 14 days of the charge (open a ticket from [/support](/support) or email support) and a person refunds it in full. Other refund requests are reviewed individually by a person. Refunds go back to the original payment method through Stripe. See the [terms](/terms).

## Deleting your account with an active subscription

If you delete your account, any active subscription of the workspaces you alone own is canceled at once, without a refund for the rest of the period. Invoices and payment records stay with Stripe as required for accounting. See [Deleting your account](/help/delete-your-account).

## Related

- [Plans and limits](/help/plans-and-limits)
- [Team members and roles](/help/team-members-and-roles)
