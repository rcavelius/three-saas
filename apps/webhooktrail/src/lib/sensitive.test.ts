import { describe, expect, it } from "vitest";
import { displayHeaderValue, isSensitiveHeader, MASK, maskHeaders, maskHeaderValue, maskQueryString } from "./sensitive";

describe("sensitive header masking", () => {
  it("flags the documented sensitive headers, case-insensitively", () => {
    for (const h of [
      "Authorization",
      "cookie",
      "Set-Cookie",
      "X-Api-Key",
      "Proxy-Authorization",
      "Stripe-Signature",
      "X-Hub-Signature-256",
      "X-Shopify-Hmac-Signature",
      "X-Slack-Signature",
      "X-Gitlab-Token",
      "X-Auth-Token",
      "X-Webhook-Secret",
    ]) {
      expect(isSensitiveHeader(h), h).toBe(true);
    }
    for (const h of ["content-type", "user-agent", "x-github-event", "accept", "x-request-id", "x-signature-version-info"]) {
      expect(isSensitiveHeader(h), h).toBe(false);
    }
  });

  it("keeps the auth scheme and cookie names but hides values", () => {
    expect(maskHeaderValue("Authorization", "Bearer abc.def.ghi")).toBe(`Bearer ${MASK}`);
    expect(maskHeaderValue("authorization", "opaque")).toBe(MASK);
    expect(maskHeaderValue("cookie", "a=1; session=xyz")).toBe(`a=${MASK}; session=${MASK}`);
    expect(maskHeaderValue("set-cookie", "sid=abc; Path=/; HttpOnly")).toBe(`sid=${MASK}; Path=/; HttpOnly`);
    expect(maskHeaderValue("stripe-signature", "t=1,v1=deadbeef")).toBe(MASK);
  });

  it("reveals only on request", () => {
    expect(displayHeaderValue("x-api-key", "k_123", false)).toBe(MASK);
    expect(displayHeaderValue("x-api-key", "k_123", true)).toBe("k_123");
    expect(displayHeaderValue("content-type", "text/plain", false)).toBe("text/plain");
  });

  it("masks lists of headers and secret-looking query params", () => {
    expect(maskHeaders([["Authorization", "Basic Zm9vOmJhcg=="], ["accept", "*/*"]])).toEqual([
      ["Authorization", `Basic ${MASK}`],
      ["accept", "*/*"],
    ]);
    const masked = maskQueryString("page=2&token=abc&api_key=zzz&q=hello");
    expect(masked).toContain("page=2");
    expect(masked).toContain("q=hello");
    expect(masked).not.toContain("abc");
    expect(masked).not.toContain("zzz");
  });
});
