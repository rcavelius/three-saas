import { describe, it, expect } from "vitest";
import { createLogger, redact } from "./index";

describe("redact", () => {
  it("hides secret-looking keys and values", () => {
    const out = redact({
      password: "hunter2",
      nested: { apiKey: "abc", note: "key sk_test_123abc used", ok: 1 },
      header: "Bearer abc.def",
    }) as Record<string, any>;
    expect(out.password).toBe("[redacted]");
    expect(out.nested.apiKey).toBe("[redacted]");
    expect(out.nested.note).toBe("key [redacted] used");
    expect(out.nested.ok).toBe(1);
    expect(out.header).toBe("[redacted]");
  });
});

describe("logger", () => {
  it("writes JSON lines with base fields", () => {
    const lines: string[] = [];
    const log = createLogger({ app: "x" }, (l) => lines.push(l)).child({ req: "r1" });
    log.info("hello", { token: "t" });
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({ level: "info", msg: "hello", app: "x", req: "r1", token: "[redacted]" });
  });
});
