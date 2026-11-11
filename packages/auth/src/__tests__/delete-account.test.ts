import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setup, headersFor, PASSWORD, type TestCtx, type Jar } from "./helpers";
import { orgScope } from "../org-scope";

/**
 * Scenario:
 *  - Alice: personal org PA (sole owner), org SOLO (sole owner, Bob is a plain member),
 *    org SHARED (Alice and Bob both owners).
 *  - Bob: personal org PB.
 *  - App data table `widgets(org_id)` with rows in every org; the app purges in onBeforeUserDelete.
 */
let t: TestCtx;
let calls: { userId: string; orgIds: string[] }[];
let failNext: boolean;
let alice: { jar: Jar; user: { id: string } };
let bob: { jar: Jar; user: { id: string } };
let PA: string, PB: string, SOLO: string, SHARED: string;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await t.handle.executor.query<T>(sql, params)).rows;
}

async function inviteAndAccept(orgId: string, email: string, role: string, inviter: Jar, invitee: Jar) {
  const inv = await t.call("/organization/invite-member", { body: { email, role, organizationId: orgId }, jar: inviter });
  expect(inv.status).toBe(200);
  const { id } = (await inv.json()) as { id: string };
  expect((await t.call("/organization/accept-invitation", { body: { invitationId: id }, jar: invitee })).status).toBe(200);
}

beforeEach(async () => {
  calls = [];
  failNext = false;
  t = await setup({
    onBeforeUserDelete: async (userId, orgIds) => {
      calls.push({ userId, orgIds: [...orgIds] });
      if (failNext) throw new Error("billing cancellation failed");
      // what an app does: cancel billing, then purge every org-scoped row
      for (const orgId of orgIds) {
        const scope = orgScope(orgId);
        await t.handle.executor.query(`DELETE FROM widgets WHERE org_id = $1`, scope.params());
      }
    },
  });
  await t.handle.executor.exec(`CREATE TABLE widgets (id serial PRIMARY KEY, org_id text NOT NULL, name text NOT NULL)`);

  alice = await t.verifiedUser("alice@example.com", "Alice");
  bob = await t.verifiedUser("bob@example.com", "Bob");
  PA = (await t.auth.requireOrg(headersFor(alice.jar))).org.id;
  PB = (await t.auth.requireOrg(headersFor(bob.jar))).org.id;
  SOLO = ((await (await t.call("/organization/create", { body: { name: "Solo", slug: "solo" }, jar: alice.jar })).json()) as { id: string }).id;
  SHARED = ((await (await t.call("/organization/create", { body: { name: "Shared", slug: "shared" }, jar: alice.jar })).json()) as { id: string }).id;
  await inviteAndAccept(SOLO, "bob@example.com", "member", alice.jar, bob.jar);
  await inviteAndAccept(SHARED, "bob@example.com", "owner", alice.jar, bob.jar);
  // a pending invitation in SOLO that must disappear with it
  expect((await t.call("/organization/invite-member", { body: { email: "carol@example.com", role: "member", organizationId: SOLO }, jar: alice.jar })).status).toBe(200);

  for (const org of [PA, PB, SOLO, SHARED]) {
    await t.handle.executor.query(`INSERT INTO widgets (org_id, name) VALUES ($1, 'a'), ($1, 'b')`, [org]);
  }
});

afterEach(async () => {
  await t.close();
});

describe("account deletion", () => {
  it("requires the password (or a fresh session) and the wrong password deletes nothing", async () => {
    const res = await t.call("/delete-user", { body: { password: "not my password" }, jar: alice.jar });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(calls).toEqual([]);
    expect(await q(`SELECT 1 FROM auth_user WHERE id = $1`, [alice.user.id])).toHaveLength(1);
    expect(await q(`SELECT 1 FROM widgets`)).toHaveLength(8);
  });

  it("a stale session without a password is refused", async () => {
    await t.handle.executor.query(`UPDATE auth_session SET created_at = now() - interval '2 days' WHERE user_id = $1`, [alice.user.id]);
    const res = await t.call("/delete-user", { body: {}, jar: alice.jar });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
    expect(await q(`SELECT 1 FROM auth_user WHERE id = $1`, [alice.user.id])).toHaveLength(1);
  });

  it("unauthenticated delete is refused", async () => {
    const res = await t.call("/delete-user", { body: { password: PASSWORD } });
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("purges sole-owned orgs and their data, calls onBeforeUserDelete once, leaves other orgs intact", async () => {
    const res = await t.call("/delete-user", { body: { password: PASSWORD }, jar: alice.jar });
    expect(res.status).toBe(200);

    expect(calls).toEqual([{ userId: alice.user.id, orgIds: [PA, SOLO].sort() }]);

    // user, sessions, accounts gone
    expect(await q(`SELECT 1 FROM auth_user WHERE id = $1`, [alice.user.id])).toHaveLength(0);
    expect(await q(`SELECT 1 FROM auth_session WHERE user_id = $1`, [alice.user.id])).toHaveLength(0);
    expect(await q(`SELECT 1 FROM auth_account WHERE user_id = $1`, [alice.user.id])).toHaveLength(0);
    expect(await t.auth.getSession(headersFor(alice.jar))).toBeNull();

    // sole-owned orgs: org row, members (incl. Bob's membership in SOLO), invitations and app data gone
    for (const org of [PA, SOLO]) {
      expect(await q(`SELECT 1 FROM auth_organization WHERE id = $1`, [org])).toHaveLength(0);
      expect(await q(`SELECT 1 FROM auth_member WHERE organization_id = $1`, [org])).toHaveLength(0);
      expect(await q(`SELECT 1 FROM auth_invitation WHERE organization_id = $1`, [org])).toHaveLength(0);
      expect(await q(`SELECT 1 FROM widgets WHERE org_id = $1`, [org])).toHaveLength(0);
    }

    // shared org survives with Bob as the only (owner) member; Bob's personal org untouched
    expect(await q(`SELECT user_id, role FROM auth_member WHERE organization_id = $1`, [SHARED])).toEqual([
      { user_id: bob.user.id, role: "owner" },
    ]);
    expect(await q(`SELECT 1 FROM auth_organization WHERE id IN ($1, $2)`, [SHARED, PB])).toHaveLength(2);
    expect(await q(`SELECT 1 FROM widgets WHERE org_id IN ($1, $2)`, [SHARED, PB])).toHaveLength(4);

    // Bob is fine: session valid, SOLO no longer reachable, SHARED still is
    expect(await t.auth.getSession(headersFor(bob.jar))).not.toBeNull();
    await expect(t.auth.requireOrg(headersFor(bob.jar), { orgId: SOLO })).rejects.toMatchObject({ status: 404 });
    await expect(t.auth.requireOrg(headersFor(bob.jar), { orgId: SHARED, role: "owner" })).resolves.toMatchObject({ role: "owner" });
  });

  it("a failing onBeforeUserDelete aborts the deletion", async () => {
    failNext = true;
    const res = await t.call("/delete-user", { body: { password: PASSWORD }, jar: alice.jar });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(calls).toHaveLength(1);
    expect(await q(`SELECT 1 FROM auth_user WHERE id = $1`, [alice.user.id])).toHaveLength(1);
    expect(await q(`SELECT 1 FROM auth_organization WHERE id IN ($1, $2)`, [PA, SOLO])).toHaveLength(2);
    expect(await t.auth.getSession(headersFor(alice.jar))).not.toBeNull();
  });

  it("deletion through the internal adapter (e.g. admin tooling) purges the same way", async () => {
    const ctx = await t.auth.$betterAuth.$context;
    await ctx.internalAdapter.deleteUser(alice.user.id);
    expect(calls).toEqual([{ userId: alice.user.id, orgIds: [PA, SOLO].sort() }]);
    expect(await q(`SELECT 1 FROM auth_organization WHERE id IN ($1, $2)`, [PA, SOLO])).toHaveLength(0);
    expect(await q(`SELECT 1 FROM auth_organization WHERE id = $1`, [SHARED])).toHaveLength(1);
  });

  it("a fresh session can delete without re-entering the password", async () => {
    const res = await t.call("/delete-user", { body: {}, jar: bob.jar });
    expect(res.status).toBe(200);
    // Bob was a co-owner of SHARED with Alice -> SHARED survives; only his personal org is purged
    expect(calls).toEqual([{ userId: bob.user.id, orgIds: [PB] }]);
    expect(await q(`SELECT user_id FROM auth_member WHERE organization_id = $1`, [SHARED])).toEqual([{ user_id: alice.user.id }]);
    expect(await q(`SELECT 1 FROM auth_member WHERE organization_id = $1`, [SOLO])).toHaveLength(1);
  });
});
