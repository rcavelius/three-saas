import { describe, it, expect } from "vitest";
import { validateTargetUrl } from "./url";
import { PUBLIC_ONLY_POLICY } from "./policy";
import { safeFetch } from "./safe-fetch";
import { staticResolver } from "./testing";

// Adversarial URL spellings that must never reach a private address, whether refused at URL validation or at
// DNS time (each name is given a loopback DNS answer so nothing leaves this machine).
const BLOCKED = [
  "http://localhost./",
  "http://LOCALHOST/",
  "http://127.1/",
  "http://0/",
  "http://[::ffff:7f00:1]/",
  "http://[::ffff:127.0.0.1]/",
  "http://[fe80::1%25eth0]/",
  "http://017700000001/",
  "http://2130706433/",
  "http://metadata.google.internal/",
  "http://[0:0:0:0:0:ffff:a9fe:a9fe]/",
  "http://100.100.100.200/",
  "http://[64:ff9b::a9fe:a9fe]/",
  "http://①②⑦.0.0.1/",
  "http://0.0.0.0/",
  "http://[::]/",
  "http://127.0.0.1%09/",
  "http://example.com%2f@127.0.0.1/",
  "http://user:pass@example.com/",
];

function hostOf(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  } catch {
    return null;
  }
}

describe("adversarial URL spellings", () => {
  it.each(BLOCKED)("blocks %s", async (u) => {
    let validated = true;
    try {
      validateTargetUrl(u, PUBLIC_ONLY_POLICY);
    } catch {
      validated = false;
    }
    if (validated) {
      const host = hostOf(u)!;
      await expect(
        safeFetch(u, { resolver: staticResolver({ [host]: ["127.0.0.1"] }), timeoutMs: 2000 }),
      ).rejects.toThrow();
    }
  });

  it("public-looking names that resolve to loopback are refused at DNS time", async () => {
    await expect(
      safeFetch("http://127.0.0.1.nip.io/", {
        resolver: staticResolver({ "127.0.0.1.nip.io": ["127.0.0.1"] }),
        timeoutMs: 2000,
      }),
    ).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
  });
});
