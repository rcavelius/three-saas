import { describe, it, expect } from "vitest";
import { baseEnvSchema, parseEnv, integrations } from "./index";

const ok = { APP_URL: "http://localhost:3001", SESSION_SECRET: "x".repeat(32) };

describe("env", () => {
  it("parses a minimal env with defaults", () => {
    const env = parseEnv(baseEnvSchema, ok);
    expect(env.DATABASE_URL).toBe("pglite:./.data/db");
    expect(integrations(env)).toEqual({ stripe: false, stripeLiveMode: false, email: false, ai: false });
  });

  it("reports bad values clearly", () => {
    expect(() => parseEnv(baseEnvSchema, { ...ok, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });

  it("detects live vs test stripe keys", () => {
    const env = parseEnv(baseEnvSchema, { ...ok, STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_WEBHOOK_SECRET: "whsec_x" });
    expect(integrations(env).stripeLiveMode).toBe(true);
  });
});
