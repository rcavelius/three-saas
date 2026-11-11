import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "@repo/database";
import { notifyOwner } from "./notify";
import { acknowledgeIncident, raiseIncident, resolveIncident } from "./incidents";
import { getHeartbeat } from "./state";
import type { EmailMessage } from "./types";
import { brand, makeDb } from "./test/fixtures";

let handle: DbHandle<any>;
const ex = () => handle.executor;
let sent: EmailMessage[];
const mailer = { send: async (m: EmailMessage) => (sent.push(m), { id: String(sent.length) }) };
const OWNER = "owner@testbrand.example";

beforeAll(async () => {
  handle = await makeDb({ withAuthBilling: false });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  sent = [];
  await ex().exec(`DELETE FROM incidents; DELETE FROM ops_settings; DELETE FROM ops_heartbeats;`);
});

const at = (s: string) => new Date(s);

describe("notifyOwner", () => {
  it("stores incidents but sends nothing when the owner email is not configured", async () => {
    await raiseIncident(ex(), { fingerprint: "c1", severity: "critical", source: "t", title: "Down" });
    const r = await notifyOwner(ex(), { mailer, brand, ownerEmail: "", now: at("2026-05-01T10:00:00Z") });
    expect(r.ownerEmailConfigured).toBe(false);
    expect(sent).toEqual([]);
    const hb = await getHeartbeat(ex(), "owner-notify");
    expect(hb?.details).toMatchObject({ ownerEmailConfigured: false, note: "owner email not configured", openCritical: 1 });
  });

  it("emails a critical incident immediately and at most once per fingerprint per 6 h", async () => {
    const t0 = "2026-05-01T03:00:00Z"; // before digest hour, so only criticals are considered
    const inc = await raiseIncident(ex(), { fingerprint: "db", severity: "critical", source: "health", title: "DB down" }, { now: at(t0) });
    let r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at(t0) });
    expect(r.criticalSent).toEqual(["db"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: OWNER, tag: "alert_critical" });
    expect(sent[0]!.subject).toContain("DB down");

    // Recurs within 6 h: throttled.
    await raiseIncident(ex(), { fingerprint: "db", severity: "critical", source: "health", title: "DB down" }, { now: at("2026-05-01T05:00:00Z") });
    r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at("2026-05-01T05:00:00Z") });
    expect(r.criticalThrottled).toEqual(["db"]);
    expect(sent).toHaveLength(1);

    // Resolve + re-open inside the window must not bypass the throttle.
    await resolveIncident(ex(), inc.id);
    await raiseIncident(ex(), { fingerprint: "db", severity: "critical", source: "health", title: "DB down" }, { now: at("2026-05-01T06:00:00Z") });
    await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at("2026-05-01T06:00:00Z") });
    expect(sent).toHaveLength(1);

    // After 6 h: emailed again.
    r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at("2026-05-01T09:00:01Z"), digestHourUtc: 23 });
    expect(r.criticalSent).toEqual(["db"]);
    expect(sent).toHaveLength(2);

    // A different fingerprint is not throttled by the first.
    await raiseIncident(ex(), { fingerprint: "pay", severity: "critical", source: "billing", title: "Webhooks stuck" }, { now: at("2026-05-01T09:01:00Z") });
    r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at("2026-05-01T09:01:00Z"), digestHourUtc: 23 });
    expect(r.criticalSent).toEqual(["pay"]);
  });

  it("sends a once-daily digest containing only warnings; info never emails", async () => {
    const now = at("2026-05-01T07:00:00Z");
    await raiseIncident(ex(), { fingerprint: "w1", severity: "warning", source: "jobs", title: "Warning one" }, { now });
    await raiseIncident(ex(), { fingerprint: "w2", severity: "warning", source: "budget", title: "Warning two" }, { now });
    await raiseIncident(ex(), { fingerprint: "i1", severity: "info", source: "t", title: "Info only" }, { now });
    await raiseIncident(ex(), { fingerprint: "c1", severity: "critical", source: "t", title: "Critical thing" }, { now });

    // Before the digest hour: only the critical goes out.
    let r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now });
    expect(r.digestSent).toBe(false);
    expect(sent.map((m) => m.tag)).toEqual(["alert_critical"]);

    r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at("2026-05-01T08:05:00Z") });
    expect(r.digestSent).toBe(true);
    expect(r.digestCount).toBe(2);
    const digest = sent.find((m) => m.tag === "owner_digest")!;
    expect(digest.subject).toContain("2 open warnings");
    expect(digest.text).toContain("Warning one");
    expect(digest.text).toContain("Warning two");
    expect(digest.text).not.toContain("Info only");
    expect(digest.text).not.toContain("Critical thing");

    // Same day again: no second digest.
    r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at("2026-05-01T20:00:00Z") });
    expect(r.digestSent).toBe(false);
    // Next day after the digest hour: another digest.
    r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at("2026-05-02T08:00:00Z") });
    expect(r.digestSent).toBe(true);
    expect(sent.filter((m) => m.tag === "owner_digest")).toHaveLength(2);
    expect(sent.some((m) => m.text.includes("Info only"))).toBe(false);
  });

  it("sends no digest when only info incidents are open", async () => {
    await raiseIncident(ex(), { fingerprint: "i", severity: "info", source: "t", title: "FYI" });
    const r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at("2026-05-01T09:00:00Z") });
    expect(r.digestSent).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("acknowledged incidents", () => {
  it("stop paging the owner, stay open for dedup, and re-page if severity escalates", async () => {
    const t = at("2026-05-02T03:00:00Z");
    const w = await raiseIncident(ex(), { fingerprint: "q", severity: "warning", source: "jobs", title: "Queue slow" }, { now: t });
    expect(await acknowledgeIncident(ex(), w.id, "operator@example.com", { now: t })).toBe(true);
    // Same severity again: still acknowledged, same row.
    const again = await raiseIncident(ex(), { fingerprint: "q", severity: "warning", source: "jobs", title: "Queue slow" }, { now: t });
    expect(again.id).toBe(w.id);
    const { rows } = await ex().query<{ acknowledged_at: Date | null; status: string }>(
      `SELECT acknowledged_at, status FROM incidents WHERE id = $1`,
      [w.id],
    );
    expect(rows[0]).toMatchObject({ status: "open" });
    expect(rows[0]!.acknowledged_at).not.toBeNull();
    // Escalation to critical clears the acknowledgement and pages.
    await raiseIncident(ex(), { fingerprint: "q", severity: "critical", source: "jobs", title: "Queue stuck" }, { now: t });
    let r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: t });
    expect(r.criticalSent).toEqual(["q"]);
    // Acknowledge the critical: no further emails even after the throttle window.
    await acknowledgeIncident(ex(), w.id, "operator@example.com", { now: t });
    r = await notifyOwner(ex(), { mailer, brand, ownerEmail: OWNER, now: at("2026-05-02T12:00:00Z"), digestHourUtc: 23 });
    expect(r.criticalSent).toEqual([]);
    expect(sent).toHaveLength(1);
  });
});
