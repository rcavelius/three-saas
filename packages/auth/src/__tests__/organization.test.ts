import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setup, headersFor, type TestCtx, type Jar } from "./helpers";
import { AuthError } from "../errors";

let t: TestCtx;
let memberLimit = 100;
beforeAll(async () => {
  t = await setup({ getMemberLimit: async () => memberLimit });
});
afterAll(async () => {
  await t.close();
});

async function membersOf(orgId: string) {
  const { rows } = await t.handle.executor.query<{ user_id: string; role: string }>(
    `SELECT user_id, role FROM auth_member WHERE organization_id = $1 ORDER BY created_at`,
    [orgId],
  );
  return rows;
}

describe("personal organization", () => {
  it("is created at sign-up with the user as owner and becomes the active org", async () => {
    const { jar, user, session } = await t.verifiedUser("owner@example.com", "Zoë O'Neil <script>");
    const { rows } = await t.handle.executor.query<{ id: string; name: string; slug: string; metadata: string; role: string }>(
      `SELECT o.id, o.name, o.slug, o.metadata, m.role FROM auth_organization o JOIN auth_member m ON m.organization_id = o.id WHERE m.user_id = $1`,
      [user.id],
    );
    expect(rows).toHaveLength(1);
    const org = rows[0]!;
    expect(org.role).toBe("owner");
    expect(org.slug).toMatch(/^zoe-o-neil-script-[0-9a-f]{8}$/);
    expect(JSON.parse(org.metadata)).toEqual({ personal: true });
    expect((session as { activeOrganizationId?: string }).activeOrganizationId).toBe(org.id);

    const ctx = await t.auth.requireOrg(headersFor(jar));
    expect(ctx.org.id).toBe(org.id);
    expect(ctx.role).toBe("owner");
    expect(ctx.user.id).toBe(user.id);
  });

  it("slugs stay unique for identical names", async () => {
    const a = await t.verifiedUser("same1@example.com", "Same Name");
    const b = await t.verifiedUser("same2@example.com", "Same Name");
    const oa = await t.auth.requireOrg(headersFor(a.jar));
    const ob = await t.auth.requireOrg(headersFor(b.jar));
    expect(oa.org.slug).not.toBe(ob.org.slug);
    expect(oa.org.id).not.toBe(ob.org.id);
  });

  it("ids are text UUIDs", async () => {
    const { user, session } = await t.verifiedUser("uuid@example.com", "U");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(user.id).toMatch(uuid);
    expect(session.id).toMatch(uuid);
  });
});

describe("invitations and roles", () => {
  let owner: { jar: Jar; user: { id: string } };
  let bob: { jar: Jar; user: { id: string } };
  let eve: { jar: Jar; user: { id: string } };
  let teamOrgId: string;

  beforeAll(async () => {
    owner = await t.verifiedUser("team-owner@example.com", "Olivia");
    bob = await t.verifiedUser("bob@example.com", "Bob");
    eve = await t.verifiedUser("eve@example.com", "Eve");
    const res = await t.call("/organization/create", { body: { name: "Acme", slug: "acme" }, jar: owner.jar });
    expect(res.status).toBe(200);
    teamOrgId = ((await res.json()) as { id: string }).id;
  });

  it("owner invites by email; the invitee accepts and becomes a member", async () => {
    const inv = await t.call("/organization/invite-member", {
      body: { email: "bob@example.com", role: "member", organizationId: teamOrgId },
      jar: owner.jar,
    });
    expect(inv.status).toBe(200);
    const invitation = (await inv.json()) as { id: string };
    const mail = t.lastEmail("bob@example.com", "auth.invitation");
    expect(mail.text).toContain(`/accept-invitation/${invitation.id}`);
    expect(mail.subject).toContain("Acme");
    expect(mail.html).toContain("Acme");

    // someone else cannot accept Bob's invitation
    const stolen = await t.call("/organization/accept-invitation", { body: { invitationId: invitation.id }, jar: eve.jar });
    expect(stolen.status).toBeGreaterThanOrEqual(400);
    expect((await membersOf(teamOrgId)).some((m) => m.user_id === eve.user.id)).toBe(false);

    const acc = await t.call("/organization/accept-invitation", { body: { invitationId: invitation.id }, jar: bob.jar });
    expect(acc.status).toBe(200);
    expect(await membersOf(teamOrgId)).toEqual([
      { user_id: owner.user.id, role: "owner" },
      { user_id: bob.user.id, role: "member" },
    ]);

    const ctx = await t.auth.requireOrg(headersFor(bob.jar), { orgId: teamOrgId });
    expect(ctx.role).toBe("member");
    expect(ctx.org.slug).toBe("acme");
  });

  it("a member cannot invite, change roles or delete the org", async () => {
    const inv = await t.call("/organization/invite-member", {
      body: { email: "x@example.com", role: "member", organizationId: teamOrgId },
      jar: bob.jar,
    });
    expect(inv.status).toBe(403);

    const { rows } = await t.handle.executor.query<{ id: string }>(
      `SELECT id FROM auth_member WHERE organization_id = $1 AND user_id = $2`,
      [teamOrgId, bob.user.id],
    );
    const promote = await t.call("/organization/update-member-role", {
      body: { memberId: rows[0]!.id, role: "owner", organizationId: teamOrgId },
      jar: bob.jar,
    });
    expect(promote.status).toBe(403);

    const del = await t.call("/organization/delete", { body: { organizationId: teamOrgId }, jar: bob.jar });
    expect(del.status).toBe(403);
    expect(await membersOf(teamOrgId)).toHaveLength(2);
    expect((await membersOf(teamOrgId)).find((m) => m.user_id === bob.user.id)!.role).toBe("member");
  });

  it("a non-member cannot invite into, read or activate someone else's org", async () => {
    const inv = await t.call("/organization/invite-member", {
      body: { email: "eve2@example.com", role: "admin", organizationId: teamOrgId },
      jar: eve.jar,
    });
    expect(inv.status).toBeGreaterThanOrEqual(400);
    const full = await t.call(`/organization/get-full-organization?organizationId=${teamOrgId}`, { jar: eve.jar });
    expect(full.status).toBeGreaterThanOrEqual(400);
    const active = await t.call("/organization/set-active", { body: { organizationId: teamOrgId }, jar: eve.jar });
    expect(active.status).toBeGreaterThanOrEqual(400);
  });

  it("requireOrg: 404 for orgs the user is not in, 403 for insufficient role, 401 without session", async () => {
    const notMember = t.auth.requireOrg(headersFor(eve.jar), { orgId: teamOrgId });
    await expect(notMember).rejects.toBeInstanceOf(AuthError);
    await expect(t.auth.requireOrg(headersFor(eve.jar), { orgId: teamOrgId })).rejects.toMatchObject({ status: 404 });
    await expect(t.auth.requireOrg(headersFor(eve.jar), { orgId: "does-not-exist" })).rejects.toMatchObject({ status: 404 });

    await expect(t.auth.requireOrg(headersFor(bob.jar), { orgId: teamOrgId, role: "admin" })).rejects.toMatchObject({ status: 403 });
    await expect(t.auth.requireOrg(headersFor(bob.jar), { orgId: teamOrgId, role: "member" })).resolves.toMatchObject({ role: "member" });
    await expect(t.auth.requireOrg(headersFor(owner.jar), { orgId: teamOrgId, role: "owner" })).resolves.toMatchObject({ role: "owner" });

    await expect(t.auth.requireOrg(new Headers(), { orgId: teamOrgId })).rejects.toMatchObject({ status: 401 });
  });

  it("requireOrg re-checks membership in the DB (a removed member loses access immediately)", async () => {
    const carl = await t.verifiedUser("carl@example.com", "Carl");
    const inv = (await (
      await t.call("/organization/invite-member", { body: { email: "carl@example.com", role: "admin", organizationId: teamOrgId }, jar: owner.jar })
    ).json()) as { id: string };
    expect((await t.call("/organization/accept-invitation", { body: { invitationId: inv.id }, jar: carl.jar })).status).toBe(200);
    // accepting sets the active org on Carl's session
    expect((await t.auth.requireOrg(headersFor(carl.jar))).org.id).toBe(teamOrgId);
    expect((await t.auth.requireOrg(headersFor(carl.jar), { role: "admin" })).role).toBe("admin");

    const rm = await t.call("/organization/remove-member", {
      body: { memberIdOrEmail: "carl@example.com", organizationId: teamOrgId },
      jar: owner.jar,
    });
    expect(rm.status).toBe(200);
    await expect(t.auth.requireOrg(headersFor(carl.jar), { orgId: teamOrgId })).rejects.toMatchObject({ status: 404 });
  });

  it("an admin cannot invite someone as owner", async () => {
    const ann = await t.verifiedUser("ann@example.com", "Ann");
    const inv = (await (
      await t.call("/organization/invite-member", { body: { email: "ann@example.com", role: "admin", organizationId: teamOrgId }, jar: owner.jar })
    ).json()) as { id: string };
    expect((await t.call("/organization/accept-invitation", { body: { invitationId: inv.id }, jar: ann.jar })).status).toBe(200);
    const res = await t.call("/organization/invite-member", {
      body: { email: "boss@example.com", role: "owner", organizationId: teamOrgId },
      jar: ann.jar,
    });
    expect(res.status).toBe(403);
    const ok = await t.call("/organization/invite-member", {
      body: { email: "helper@example.com", role: "member", organizationId: teamOrgId },
      jar: ann.jar,
    });
    expect(ok.status).toBe(200);
  });

  it("getMemberLimit caps seats", async () => {
    const res = await t.call("/organization/create", { body: { name: "Tiny", slug: "tiny" }, jar: owner.jar });
    const tinyId = ((await res.json()) as { id: string }).id;
    memberLimit = 1;
    try {
      const inv = await t.call("/organization/invite-member", {
        body: { email: "eve@example.com", role: "member", organizationId: tinyId },
        jar: owner.jar,
      });
      if (inv.status === 200) {
        const { id } = (await inv.json()) as { id: string };
        const acc = await t.call("/organization/accept-invitation", { body: { invitationId: id }, jar: eve.jar });
        expect(acc.status).toBe(403);
      } else {
        expect(inv.status).toBe(403);
      }
      expect(await membersOf(tinyId)).toHaveLength(1);
    } finally {
      memberLimit = 100;
    }
  });
});
