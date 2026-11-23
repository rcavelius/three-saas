import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_NAMES } from "@repo/ops";
import { EVENT_NAMES, EVENT_SPEC } from "./analytics-events";
import { isOwnCookie } from "./capture";
import { ownerKey, PASS_COOKIE, passCookieSecret, passLimits, passOffer, weekPass } from "./pass";
import { FREE_LIMITS, planLimitsFor } from "./plans";

describe("free tier and the 7-day pass (catalog values)", () => {
  it("free: 3 endpoints, 24 h lifetime, 100 stored requests, 1 day history, no replay", () => {
    expect(FREE_LIMITS.endpoints).toBe(3);
    expect(FREE_LIMITS.endpointTtlHours).toBe(24);
    expect(FREE_LIMITS.requestsStored).toBe(100);
    expect(FREE_LIMITS.historyDays).toBe(1);
    expect(FREE_LIMITS.replay).toBe(false);
  });

  it("pass: replay + Developer capture limits for 7 days, endpoints still expire (7 days)", () => {
    const def = weekPass();
    expect(def.priceCents).toBe(500);
    expect(def.durationHours).toBe(168);
    const lim = passLimits();
    const dev = planLimitsFor("developer");
    expect(lim.replay).toBe(true);
    expect(lim.endpoints).toBe(dev.endpoints);
    expect(lim.requestsStored).toBe(dev.requestsStored);
    expect(lim.historyDays).toBe(7);
    expect(lim.maxBodyBytes).toBe(dev.maxBodyBytes);
    expect(lim.endpointTtlHours).toBe(168);
    // Abuse knobs stay at the free values.
    expect(lim.capturePerEndpointPerMinute).toBe(FREE_LIMITS.capturePerEndpointPerMinute);
    expect(lim.teamSeats).toBe(1);
  });

  it("offer copy comes from the catalog", () => {
    expect(passOffer()).toEqual({
      passId: "week",
      name: "7-day pass",
      price: "$5",
      durationLabel: "7 days",
      endpoints: "25",
      lifetimeDays: 7,
      historyDays: 7,
      requestsStored: "2,000",
      developerName: "Developer",
      developerPrice: "$9",
    });
  });

  it("cookie secret is derived, stable and not the auth secret; pass cookie is never stored by capture", () => {
    const a = passCookieSecret("x".repeat(40));
    expect(a).toBe(passCookieSecret("x".repeat(40)));
    expect(a).not.toContain("xxxx");
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(isOwnCookie(PASS_COOKIE)).toBe(true);
  });

  it("owner keys", () => {
    expect(ownerKey({ orgId: "o1" })).toBe("org:o1");
    expect(ownerKey({ anonHash: "abc" })).toBe("anon:abc");
  });

  it("analytics accepts the pass events on top of the defaults", () => {
    for (const n of DEFAULT_EVENT_NAMES) expect(EVENT_NAMES).toContain(n);
    for (const n of Object.keys(EVENT_SPEC)) expect(EVENT_NAMES).toContain(n);
    expect(EVENT_NAMES).toEqual(expect.arrayContaining(["paywall_shown", "pass_checkout_started", "pass_activated"]));
  });
});
