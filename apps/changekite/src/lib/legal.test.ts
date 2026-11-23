import { describe, expect, it } from "vitest";
import { legalInfo } from "./legal";

describe("legalInfo", () => {
  const full = { LEGAL_ENTITY: "Example LLC", LEGAL_ADDRESS: "1 Main St", LEGAL_JURISDICTION: "the State of Delaware, USA", LEGAL_APPROVED: "1" };

  it("is a draft with ChangeKite contact defaults until configured", () => {
    const l = legalInfo({});
    expect(l.published).toBe(false);
    expect(l.supportEmail).toBe("support@changekite.com");
    expect(l.abuseEmail).toBe("abuse@changekite.com");
  });

  it("publishes only with every operator detail and the approval flag", () => {
    expect(legalInfo(full).published).toBe(true);
    expect(legalInfo({ ...full, LEGAL_APPROVED: undefined }).published).toBe(false);
    expect(legalInfo({ ...full, LEGAL_ADDRESS: " " }).published).toBe(false);
    expect(legalInfo({ ...full, SUPPORT_EMAIL: "help@example.com" }).supportEmail).toBe("help@example.com");
  });
});
