import { describe, expect, it } from "vitest";
import { isSecretKey, looksLikeCardNumber, maskBodyText, maskJson } from "./mask-body";
import { classifyReplayHeader, planReplayHeaders } from "./replay-headers";
import { isSensitiveHeader, MASK } from "./sensitive";
import { buildCurl } from "./curl";

describe("body masking", () => {
  it("recognises secret-like keys in any casing/style", () => {
    for (const k of ["password", "Password", "client_secret", "accessToken", "refresh_token", "api_key", "apiKey", "X-Api-Key", "authorization", "card_number", "cardNumber", "cvv", "cvc", "private_key", "ssn"]) {
      expect(isSecretKey(k), k).toBe(true);
    }
    for (const k of ["token_type", "event", "amount", "id", "description", "tokens_used"]) expect(isSecretKey(k), k).toBe(false);
  });

  it("detects card numbers with the Luhn check", () => {
    expect(looksLikeCardNumber("4242 4242 4242 4242")).toBe(true);
    expect(looksLikeCardNumber("4242-4242-4242-4241")).toBe(false);
    expect(looksLikeCardNumber("1234")).toBe(false);
  });

  it("masks JSON values (deeply) and card numbers; keeps everything else", () => {
    const { value, count } = maskJson({
      event: "charge",
      data: { password: "hunter2", nested: [{ api_key: "k1" }], card: { number: "4242424242424242", cvc: "123" } },
      token_type: "Bearer",
    });
    expect(count).toBe(4);
    expect(JSON.stringify(value)).not.toMatch(/hunter2|k1|4242424242424242|"123"/);
    expect((value as { token_type: string }).token_type).toBe("Bearer");
  });

  it("masks raw JSON text and form bodies but keeps formatting", () => {
    const raw = '{\n  "user": "ann",\n  "password": "hunter2",\n  "n": 1\n}';
    const m = maskBodyText(raw, "application/json");
    expect(m.text).toBe(`{\n  "user": "ann",\n  "password": "${MASK}",\n  "n": 1\n}`);
    expect(m.count).toBe(1);
    const form = maskBodyText("user=ann&client_secret=abc&card=4242424242424242", "application/x-www-form-urlencoded");
    expect(form.text).not.toMatch(/abc|4242424242424242/);
    expect(form.count).toBe(2);
  });

  it("masks body secrets in the cURL export unless revealed", () => {
    const base = {
      captureUrl: "https://h.example/h/x",
      method: "POST",
      path: "/",
      query: "",
      headers: [["content-type", "application/json"]] as [string, string][],
      bodyText: '{"password":"hunter2"}',
      bodySize: 22,
      truncated: false,
      contentType: "application/json",
    };
    expect(buildCurl(base)).not.toContain("hunter2");
    expect(buildCurl({ ...base, revealSecrets: true })).toContain("hunter2");
  });
});

describe("header classification", () => {
  it("masks *-Token, *-Api-Key and friends in the UI", () => {
    for (const h of ["x-shopify-access-token", "x-gitlab-token", "x-custom-api-key", "x-api-key", "authorization", "cookie", "x-hub-signature-256"]) {
      expect(isSensitiveHeader(h), h).toBe(true);
    }
  });

  it("replay: excludes sensitive unless ticked, warns on signatures, never forwards hop/proxy headers", () => {
    expect(classifyReplayHeader("Authorization")).toBe("sensitive");
    expect(classifyReplayHeader("X-Shopify-Access-Token")).toBe("sensitive");
    expect(classifyReplayHeader("X-Custom-Api-Key")).toBe("sensitive");
    expect(classifyReplayHeader("Stripe-Signature")).toBe("signature");
    expect(classifyReplayHeader("X-Hub-Signature-256")).toBe("signature");
    expect(classifyReplayHeader("svix-timestamp")).toBe("signature");
    for (const h of ["host", "content-length", "x-forwarded-for", "x-real-ip", "forwarded", "cookie", "fly-client-ip", "connection"]) {
      expect(classifyReplayHeader(h), h).toBe("blocked");
    }
    const plan = planReplayHeaders(
      [
        ["authorization", "Bearer a"],
        ["x-api-key", "k"],
        ["stripe-signature", "t=1"],
        ["content-type", "application/json"],
        ["host", "evil"],
      ],
      ["X-API-KEY"],
    );
    expect(plan.send).toEqual([
      ["x-api-key", "k"],
      ["stripe-signature", "t=1"],
      ["content-type", "application/json"],
    ]);
    expect(plan.excludedSensitive).toEqual(["authorization"]);
    expect(plan.signatureWarnings).toEqual(["stripe-signature"]);
    expect(plan.blocked).toEqual(["host"]);
  });
});
