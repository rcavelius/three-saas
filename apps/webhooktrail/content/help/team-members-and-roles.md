---
title: Team members and roles
slug: team-members-and-roles
summary: Invite teammates to your workspace, what owners, admins and members can do, and how many seats each plan includes.
category: Account & security
updated: 2026-11-11
---
A WebhookTrail workspace can have several members. Manage them at [/account/team](/account/team).

## Seats per plan

- Free: 1 seat
- Developer: 1 seat
- Pro: 5 seats

Every member uses a seat, and so does every pending invitation. When all seats are used, you cannot send new invitations until you remove a member, cancel an invitation, or upgrade to Pro at [/account/billing](/account/billing).

## Roles

**Owner**

- Everything an admin can do.
- The only role that can manage billing: upgrade, change plan, update the card or cancel.

**Admin**

- Invite and remove members, change a member's role between member and admin.
- Delete endpoints.
- Add, change, verify and delete replay destinations.

**Member**

- Sees all of the workspace's endpoints and captured requests.
- Can create endpoints, inspect requests and replay to verified destinations (on plans with replay).
- Cannot delete endpoints, manage destinations, manage the team or change billing.

## Invite someone

1. On [/account/team](/account/team), enter their email address and pick **member** or **admin**.
2. Click **Send invitation**. They receive an email with a link.
3. They log in, or create an account with the invited email address, and accept. Their email address must be confirmed first.

Invitations expire after 7 days. You can see pending invitations on the team page and cancel them there.

If sending fails with a message about seats or permission, either all seats are used or you are not an owner or admin.

## Remove a member or change a role

Owners and admins can change another member's role or remove them from the team page. The owner's role cannot be changed there.

## Leaving and account deletion

If an owner deletes their account, workspaces they alone own are deleted with all their data. Workspaces with another owner remain. See [Deleting your account](/help/delete-your-account).
