import { describe, expect, it } from "vitest";
import { stagingGate } from "./staging";

const req = (path: string, auth?: string) =>
  new Request(`https://staging.example${path}`, { headers: auth ? { authorization: auth } : {} });
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

describe("stagingGate", () => {
  it("is a no-op without a (long enough) password", () => {
    expect(stagingGate({ password: undefined })(req("/"))).toBeNull();
    expect(stagingGate({ password: "short" })(req("/"))).toBeNull();
  });

  it("challenges pages and APIs, accepts the right password with any username", async () => {
    const gate = stagingGate({ password: "correct-horse-battery", exempt: ["/api/cron/", "/api/health"] });
    const denied = gate(req("/pricing"));
    expect(denied?.status).toBe(401);
    expect(denied?.headers.get("www-authenticate")).toMatch(/^Basic realm=/);
    expect(denied?.headers.get("x-robots-tag")).toContain("noindex");
    expect(gate(req("/api/workflows"))?.status).toBe(401);
    expect(gate(req("/", basic("anyone", "correct-horse-battery")))).toBeNull();
    expect(gate(req("/", basic("anyone", "wrong-password")))?.status).toBe(401);
    expect(gate(req("/", "Bearer correct-horse-battery"))?.status).toBe(401);
    expect(gate(req("/", "Basic !!!"))?.status).toBe(401);
  });

  it("exempts machine endpoints that authenticate themselves", () => {
    const gate = stagingGate({ password: "correct-horse-battery", exempt: ["/api/cron/", "/api/health"] });
    expect(gate(req("/api/cron/tick"))).toBeNull();
    expect(gate(req("/api/health"))).toBeNull();
    expect(gate(req("/api/healthz"))).toBeNull(); // prefix match is intentional; keep exempt lists precise
    expect(gate(req("/api/cronx"))?.status).toBe(401);
  });
});
