import { describe, it, expect } from "vitest";
import { validateTargetUrl, checkTargetUrl } from "./url";
import { SafeFetchError } from "./errors";

function codeOf(input: string): string {
  try {
    validateTargetUrl(input);
    return "OK";
  } catch (err) {
    if (err instanceof SafeFetchError) return err.code;
    throw err;
  }
}

describe("validateTargetUrl", () => {
  it.each([
    ["https://example.com/", "OK"],
    ["http://example.com/path?q=1#frag", "OK"],
    ["https://sub.example.co.uk:443/", "OK"],
    ["http://example.com:80/", "OK"],
    ["https://xn--bcher-kva.example.com/", "OK"],
    ["https://8.8.8.8/", "OK"],
    ["https://[2606:4700:4700::1111]/", "OK"],
    ["https://example.com./", "OK"],
    // schemes
    ["ftp://example.com/", "BLOCKED_SCHEME"],
    ["file:///etc/passwd", "BLOCKED_SCHEME"],
    ["gopher://example.com/", "BLOCKED_SCHEME"],
    ["javascript:alert(1)", "BLOCKED_SCHEME"],
    ["data:text/html,hi", "BLOCKED_SCHEME"],
    ["ws://example.com/", "BLOCKED_SCHEME"],
    // credentials
    ["https://user:pass@example.com/", "BLOCKED_CREDENTIALS"],
    ["https://user@example.com/", "BLOCKED_CREDENTIALS"],
    // ports
    ["http://example.com:8080/", "BLOCKED_PORT"],
    ["https://example.com:22/", "BLOCKED_PORT"],
    ["http://example.com:443/", "OK"],
    // odd hostnames
    ["http://localhost/", "BLOCKED_HOST"],
    ["http://LOCALHOST./", "BLOCKED_HOST"],
    ["http://foo.localhost/", "BLOCKED_HOST"],
    ["http://printer.local/", "BLOCKED_HOST"],
    ["http://db.internal/", "BLOCKED_HOST"],
    ["http://metadata.google.internal/", "BLOCKED_HOST"],
    ["http://router.home.arpa/", "BLOCKED_HOST"],
    ["http://intranet/", "BLOCKED_HOST"],
    ["http://site.test/", "BLOCKED_HOST"],
    ["http://x.onion/", "BLOCKED_HOST"],
    // IP literals and encodings
    ["http://127.0.0.1/", "BLOCKED_ADDRESS"],
    ["http://10.1.2.3/", "BLOCKED_ADDRESS"],
    ["http://169.254.169.254/latest/meta-data/", "BLOCKED_ADDRESS"],
    ["http://0.0.0.0/", "BLOCKED_ADDRESS"],
    ["http://[::1]/", "BLOCKED_ADDRESS"],
    ["http://[::ffff:127.0.0.1]/", "BLOCKED_ADDRESS"],
    ["http://[::ffff:7f00:1]/", "BLOCKED_ADDRESS"],
    ["http://[fd00:ec2::254]/", "BLOCKED_ADDRESS"],
    ["http://[fe80::1%25eth0]/", "INVALID_URL"],
    ["http://2130706433/", "BLOCKED_HOST"],
    ["http://0x7f.1/", "BLOCKED_HOST"],
    ["http://0x7f000001/", "BLOCKED_HOST"],
    ["http://0177.0.0.1/", "BLOCKED_HOST"],
    ["http://127.1/", "BLOCKED_HOST"],
    ["http://%31%32%37.0.0.1/", "BLOCKED_HOST"],
    ["http://134744072/", "BLOCKED_HOST"],
    // parser confusion
    ["http://example.com\\@127.0.0.1/", "INVALID_URL"],
    ["http://exa mple.com/", "INVALID_URL"],
    ["not a url", "INVALID_URL"],
    ["", "INVALID_URL"],
    ["https://example.com/" + "a".repeat(2100), "INVALID_URL"],
  ])("%s -> %s", (input, expected) => {
    expect(codeOf(input)).toBe(expected);
  });

  it("strips the fragment and trailing dot", () => {
    const v = validateTargetUrl("https://Example.COM./a#x");
    expect(v.url.href).toBe("https://example.com/a");
    expect(v.hostname).toBe("example.com");
  });

  it("checkTargetUrl is non-throwing", () => {
    expect(checkTargetUrl("http://localhost/").ok).toBe(false);
    expect(checkTargetUrl("https://example.com").ok).toBe(true);
  });
});
