import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { safeFetch } from "./safe-fetch";
import { SafeFetchError } from "./errors";
import { createLoopbackTestPolicy, staticResolver } from "./testing";
import type { AddressPolicy } from "./policy";

let server: http.Server;
let port = 0;
const policy = createLoopbackTestPolicy();
const HOST = "site.example.com";
const base = () => `http://${HOST}:${port}`;
const resolver = staticResolver({ [HOST]: ["127.0.0.1"], "other.example.com": ["127.0.0.1"] });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname;
    if (p === "/ok") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello");
    } else if (p === "/echo") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.headers));
    } else if (p.startsWith("/loop/")) {
      const n = Number(p.split("/")[2]);
      res.writeHead(302, { location: `/loop/${n + 1}` });
      res.end();
    } else if (p === "/chain") {
      // 5 redirects then 200
      const n = Number(url.searchParams.get("n") ?? 0);
      if (n < 5) {
        res.writeHead(301, { location: `/chain?n=${n + 1}` });
        res.end();
      } else {
        res.writeHead(200);
        res.end("done");
      }
    } else if (p === "/to") {
      res.writeHead(302, { location: url.searchParams.get("u") ?? "/" });
      res.end();
    } else if (p === "/big") {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      const chunk = Buffer.alloc(64 * 1024, 97);
      let sent = 0;
      const write = () => {
        while (sent < 5 * 1024 * 1024) {
          sent += chunk.length;
          if (!res.write(chunk)) {
            res.once("drain", write);
            return;
          }
        }
        res.end();
      };
      write();
    } else if (p === "/gzip-bomb") {
      res.writeHead(200, { "content-encoding": "gzip" });
      res.end(gzipSync(Buffer.alloc(4 * 1024 * 1024, 0)));
    } else if (p === "/gzip") {
      res.writeHead(200, { "content-encoding": "gzip", "content-type": "text/html" });
      res.end(gzipSync(Buffer.from("<title>zipped</title>")));
    } else if (p === "/slow") {
      // never responds
    } else if (p === "/slow-body") {
      res.writeHead(200);
      res.write("partial");
    } else if (p === "/head") {
      res.writeHead(200, { "x-method": req.method ?? "" });
      res.end(req.method === "HEAD" ? undefined : "body");
    } else {
      res.writeHead(404);
      res.end("nope");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

async function errCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (err) {
    if (err instanceof SafeFetchError) return err.code;
    throw err;
  }
}

describe("safeFetch with the loopback test policy", () => {
  it("fetches a page, pinned to the validated IP (the hostname does not exist in real DNS)", async () => {
    const res = await safeFetch(`${base()}/ok`, { resolver, policy });
    expect(res.status).toBe(200);
    expect(res.text()).toBe("hello");
    expect(res.address).toBe("127.0.0.1");
  });

  it("identifies as ChangeKiteBot and never forwards cookies or auth headers", async () => {
    const res = await safeFetch(`${base()}/echo`, {
      resolver,
      policy,
      userAgent: "ChangeKiteBot/1.0 (+https://changekite.example/bot)",
      headers: { cookie: "a=b", authorization: "Bearer x", "proxy-authorization": "y", host: "evil", "accept-language": "en" },
    });
    const h = JSON.parse(res.text()) as Record<string, string>;
    expect(h["user-agent"]).toBe("ChangeKiteBot/1.0 (+https://changekite.example/bot)");
    expect(h.cookie).toBeUndefined();
    expect(h.authorization).toBeUndefined();
    expect(h["proxy-authorization"]).toBeUndefined();
    expect(h.host).toBe(`${HOST}:${port}`);
    expect(h["accept-language"]).toBe("en");
  });

  it("follows up to 5 redirects and records them", async () => {
    const res = await safeFetch(`${base()}/chain`, { resolver, policy });
    expect(res.status).toBe(200);
    expect(res.redirects).toHaveLength(5);
    expect(res.url).toBe(`${base()}/chain?n=5`);
  });

  it("stops after the redirect limit", async () => {
    expect(await errCode(safeFetch(`${base()}/loop/0`, { resolver, policy }))).toBe("TOO_MANY_REDIRECTS");
    expect(await errCode(safeFetch(`${base()}/loop/0`, { resolver, policy, maxRedirects: 50 }))).toBe("TOO_MANY_REDIRECTS");
  });

  it("can return the redirect itself", async () => {
    const res = await safeFetch(`${base()}/loop/0`, { resolver, policy, followRedirects: false });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/loop/1");
  });

  it.each([
    ["http://10.0.0.5/", "BLOCKED_ADDRESS"],
    ["http://169.254.169.254/latest/meta-data/", "BLOCKED_ADDRESS"],
    ["http://[::ffff:169.254.169.254]/", "BLOCKED_ADDRESS"],
    ["http://2130706433/", "BLOCKED_HOST"],
    ["http://0x7f.1/", "BLOCKED_HOST"],
    ["file:///etc/passwd", "BLOCKED_SCHEME"],
    ["gopher://x.example.com/", "BLOCKED_SCHEME"],
    ["http://user:pw@other.example.com/", "BLOCKED_CREDENTIALS"],
    ["http://localhost/", "BLOCKED_HOST"],
    ["http://unknown-host.example.com/", "DNS_FAILURE"],
  ])("blocks a redirect to %s", async (target, code) => {
    const url = `${base()}/to?u=${encodeURIComponent(target)}`;
    expect(await errCode(safeFetch(url, { resolver, policy }))).toBe(code);
  });

  it("re-resolves and re-validates on every hop (DNS rebinding: public/allowed first, private next)", async () => {
    let calls = 0;
    const rebinding = staticResolver({
      [HOST]: () => (++calls === 1 ? ["127.0.0.1"] : ["10.0.0.1"]),
    });
    expect(await errCode(safeFetch(`${base()}/loop/0`, { resolver: rebinding, policy }))).toBe("BLOCKED_ADDRESS");
    expect(calls).toBe(2);
  });

  it("rejects a host when ANY resolved address is non-public", async () => {
    const mixed = staticResolver({ [HOST]: ["127.0.0.1", "192.168.0.10"] });
    expect(await errCode(safeFetch(`${base()}/ok`, { resolver: mixed, policy }))).toBe("BLOCKED_ADDRESS");
  });

  it("enforces the body size limit while streaming", async () => {
    expect(await errCode(safeFetch(`${base()}/big`, { resolver, policy, maxBodyBytes: 1024 * 1024 }))).toBe("BODY_TOO_LARGE");
    const res = await safeFetch(`${base()}/big`, { resolver, policy, maxBodyBytes: 100_000, onOversize: "truncate" });
    expect(res.truncated).toBe(true);
    expect(res.body.length).toBe(100_000);
  });

  it("caps decompressed size (gzip bomb)", async () => {
    expect(await errCode(safeFetch(`${base()}/gzip-bomb`, { resolver, policy, maxBodyBytes: 1024 * 1024 }))).toBe("BODY_TOO_LARGE");
  });

  it("decodes gzip bodies", async () => {
    const res = await safeFetch(`${base()}/gzip`, { resolver, policy });
    expect(res.text()).toBe("<title>zipped</title>");
  });

  it("times out on a server that never answers", async () => {
    const t = Date.now();
    expect(await errCode(safeFetch(`${base()}/slow`, { resolver, policy, timeoutMs: 300 }))).toBe("TIMEOUT");
    expect(Date.now() - t).toBeLessThan(3000);
  });

  it("times out on a body that never finishes", async () => {
    expect(await errCode(safeFetch(`${base()}/slow-body`, { resolver, policy, timeoutMs: 300 }))).toBe("TIMEOUT");
  });

  it("supports HEAD and rejects other methods", async () => {
    const res = await safeFetch(`${base()}/head`, { resolver, policy, method: "HEAD" });
    expect(res.headers["x-method"]).toBe("HEAD");
    expect(res.body.length).toBe(0);
    const post = safeFetch(`${base()}/ok`, { resolver, policy, method: "POST" as unknown as "GET" });
    expect(await errCode(post)).toBe("BLOCKED_METHOD");
  });

  it("rejects hand-made policy objects", async () => {
    const fake: AddressPolicy = { name: "fake", allowAddress: () => true, allowPort: () => true };
    expect(await errCode(safeFetch(`${base()}/ok`, { resolver, policy: fake }))).toBe("BLOCKED_POLICY");
  });
});

describe("safeFetch with the default (production) policy", () => {
  it("refuses a hostname that resolves to loopback", async () => {
    expect(await errCode(safeFetch(`http://${HOST}/ok`, { resolver }))).toBe("BLOCKED_ADDRESS");
  });
  it("refuses non-default ports", async () => {
    expect(await errCode(safeFetch(`${base()}/ok`, { resolver }))).toBe("BLOCKED_PORT");
  });
  it("refuses loopback IP literals and non-http schemes", async () => {
    expect(await errCode(safeFetch("http://127.0.0.1/"))).toBe("BLOCKED_ADDRESS");
    expect(await errCode(safeFetch("http://[::1]/"))).toBe("BLOCKED_ADDRESS");
    expect(await errCode(safeFetch("ftp://example.com/"))).toBe("BLOCKED_SCHEME");
  });
});

describe("inspectTls", () => {
  it("validates the target before connecting", async () => {
    const { inspectTls } = await import("./tls-inspect");
    expect(await errCode(inspectTls("http://example.com/"))).toBe("BLOCKED_SCHEME");
    expect(await errCode(inspectTls("https://127.0.0.1/"))).toBe("BLOCKED_ADDRESS");
    expect(await errCode(inspectTls(`https://${HOST}/`, { resolver }))).toBe("BLOCKED_ADDRESS");
  });
  it("reports a TLS failure against a plain-http server instead of hanging", async () => {
    const { inspectTls } = await import("./tls-inspect");
    expect(await errCode(inspectTls(`https://${HOST}:${port}/`, { resolver, policy, timeoutMs: 2000 }))).toMatch(/TLS_ERROR|TIMEOUT/);
  });
});

describe("test policy guard", () => {
  it("refuses to create the loopback policy in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => createLoopbackTestPolicy()).toThrow(/never be used in production/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("is not exported from the package root", async () => {
    const root = await import("./index");
    expect(Object.keys(root)).not.toContain("createLoopbackTestPolicy");
    expect(Object.keys(root)).not.toContain("internalCreateLoopbackPolicy");
  });
});
