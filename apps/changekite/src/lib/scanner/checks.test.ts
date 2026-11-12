import { describe, it, expect } from "vitest";
import { parsePage } from "./html";
import type { CrawledPage, HttpsInfo, UrlStatus } from "./types";
import { checkImages, checkMetaDescriptions, checkTitles } from "./checks/content";
import { checkCanonicals } from "./checks/canonical";
import { checkMixedContent } from "./checks/mixed-content";
import { checkExternalLinks, checkInternalLinks } from "./checks/links";
import { checkHttps, checkRobots, checkSitemap } from "./checks/site";
import { computeScore } from "./score";

function page(url: string, html: string, extra: Partial<CrawledPage> = {}): CrawledPage {
  const parsed = parsePage(html, url, extra.headers ?? {});
  return {
    url,
    finalUrl: url,
    depth: 0,
    status: 200,
    redirects: [],
    contentType: "text/html",
    isHtml: true,
    headers: {},
    parsed,
    internalLinks: parsed.links.filter((l) => new URL(l.href).hostname === new URL(url).hostname).map((l) => l.href),
    externalLinks: parsed.links.filter((l) => new URL(l.href).hostname !== new URL(url).hostname).map((l) => l.href),
    ...extra,
  };
}

const ids = (issues: { id: string }[]) => issues.map((i) => i.id).sort();

describe("parsePage", () => {
  it("extracts title, description, canonicals, links, images and subresources", () => {
    const p = parsePage(
      `<!doctype html><html><head>
        <base href="/sub/">
        <title>  Hello   World </title>
        <META NAME="Description" content="A page">
        <meta name="robots" content="NOINDEX, follow">
        <link rel="canonical" href="page">
        <link rel="stylesheet" href="http://cdn.example.com/a.css">
      </head><body>
        <svg><title>icon</title></svg>
        <a href="x">X</a><a href="#top">top</a><a href="mailto:a@b.c">mail</a><a href="https://other.org/" rel="nofollow">o</a>
        <img src="a.png"><img src="b.png" alt=""><img src="c.png" alt="C"><img src="d.png" aria-hidden="true">
        <img srcset="http://x.example.com/1.png 1x, https://x.example.com/2.png 2x" alt="">
      </body></html>`,
      "https://example.com/dir/index.html",
    );
    expect(p.title).toBe("Hello World");
    expect(p.titleCount).toBe(1);
    expect(p.metaDescription).toBe("A page");
    expect(p.robotsDirectives).toEqual(["noindex", "follow"]);
    expect(p.canonicals).toEqual([{ raw: "page", resolved: "https://example.com/sub/page", inHead: true }]);
    expect(p.links.map((l) => l.href)).toEqual(["https://example.com/sub/x", "https://other.org/"]);
    expect(p.links[1]!.nofollow).toBe(true);
    expect(p.images.map((i) => i.alt)).toEqual([null, "", "C", ""]);
    expect(p.subresources.filter((s) => s.url.startsWith("http:")).map((s) => s.tag)).toEqual(["stylesheet", "img"]);
  });
});

describe("title and description checks", () => {
  const long = "x".repeat(70);
  const pages = [
    page("https://e.com/a", "<title>Same title here</title><meta name=description content='" + "d".repeat(80) + "'>"),
    page("https://e.com/b", "<title>Same title here</title><meta name=description content='" + "d".repeat(80) + "'>"),
    page("https://e.com/c", "<head></head><body>no title</body>"),
    page("https://e.com/d", "<title></title><meta name=description content=''>"),
    page("https://e.com/e", `<title>${long}</title><meta name=description content="short">`),
    page("https://e.com/f", "<title>Hi</title><title>Again</title><meta name=description content='" + "z".repeat(200) + "'>"),
    page("https://e.com/g", "<title>Same title here</title><meta name=robots content=noindex><meta name=description content='" + "d".repeat(80) + "'>"),
    page("https://e.com/404", "<title>Not found</title>", { status: 404 }),
  ];

  it("flags missing, empty, long, short, multiple and duplicate titles", () => {
    expect(ids(checkTitles(pages))).toEqual(
      ["title-duplicate", "title-empty", "title-missing", "title-multiple", "title-too-long", "title-too-short"].sort(),
    );
    const dup = checkTitles(pages).find((i) => i.id === "title-duplicate")!;
    expect(dup.message).toContain("2 pages"); // the noindex page is excluded
  });

  it("flags missing, empty, short, long and duplicate descriptions", () => {
    expect(ids(checkMetaDescriptions(pages))).toEqual(
      ["description-duplicate", "description-empty", "description-missing", "description-too-long", "description-too-short"].sort(),
    );
  });
});

describe("image alt check", () => {
  it("flags missing alt but not decorative alt=\"\"", () => {
    const issues = checkImages([
      page("https://e.com/", '<img src="/a.png"><img src="/b.png" alt=""><img src="/c.png" alt="ok"><img src="/a.png">'),
      page("https://e.com/ok", '<img src="/b.png" alt="">'),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe("2 images without an alt attribute");
    expect(issues[0]!.page).toBe("https://e.com/");
  });
});

describe("canonical check", () => {
  const statuses = new Map<string, UrlStatus>([
    ["https://e.com/moved", { status: 301, location: "https://e.com/new" }],
    ["https://e.com/gone", { status: 404 }],
    ["https://e.com/fine", { status: 200 }],
  ]);
  const hosts = ["e.com"];
  const run = (html: string, url = "https://e.com/p") => ids(checkCanonicals([page(url, html)], statuses, hosts));

  it("accepts a relative self canonical", () => {
    expect(run('<head><link rel="canonical" href="/p"></head>')).toEqual([]);
    expect(run('<head><link rel="canonical" href="/fine"></head>')).toEqual([]);
  });
  it("flags missing, multiple, empty, body, cross-host, http, redirecting, broken and noindex conflicts", () => {
    expect(run("<head><title>x</title></head>")).toEqual(["canonical-missing"]);
    expect(run("<head><meta name=robots content=noindex></head>")).toEqual([]);
    expect(run('<head><link rel="canonical" href="/a"><link rel="canonical" href="/b"></head>')).toEqual(["canonical-multiple"]);
    expect(run('<head><link rel="canonical" href=""></head>')).toEqual(["canonical-invalid"]);
    expect(run('<head></head><body><div><link rel="canonical" href="/p"></div></body>')).toEqual(["canonical-in-body"]);
    expect(run('<head><link rel="canonical" href="https://other.com/p"></head>')).toEqual(["canonical-cross-host"]);
    expect(run('<head><link rel="canonical" href="http://e.com/p"></head>')).toEqual(["canonical-http"]);
    expect(run('<head><link rel="canonical" href="/moved"></head>')).toEqual(["canonical-redirects"]);
    expect(run('<head><link rel="canonical" href="/gone"></head>')).toEqual(["canonical-broken"]);
    expect(run('<head><meta name="robots" content="noindex"><link rel="canonical" href="/fine"></head>')).toEqual(["canonical-noindex-conflict"]);
  });
  it("reads a canonical from the Link header", () => {
    const p = page("https://e.com/p", "<head></head>", { headers: { link: '<https://e.com/gone>; rel="canonical"' } });
    expect(ids(checkCanonicals([p], statuses, hosts))).toEqual(["canonical-broken"]);
  });
});

describe("mixed content check", () => {
  it("reports active, passive and form mixed content only on https pages", () => {
    const html = `<head><script src="http://cdn.x.com/a.js"></script></head><body>
      <img src="http://cdn.x.com/a.png" alt=""><img src="https://cdn.x.com/b.png" alt=""><img src="/rel.png" alt="">
      <form action="http://e.com/post"></form></body>`;
    expect(ids(checkMixedContent([page("https://e.com/", html)]))).toEqual(["mixed-content-active", "mixed-content-form", "mixed-content-passive"]);
    expect(checkMixedContent([page("http://e.com/", html)])).toEqual([]);
  });
});

describe("link checks", () => {
  const p = page("https://e.com/", '<a href="/a">a</a><a href="/b">b</a><a href="/c">c</a><a href="/d">d</a><a href="https://x.org/1">x</a><a href="https://x.org/2">x</a><a href="https://x.org/3">x</a><a href="https://nx.invalid-domain.org/">x</a><a href="http://localhost/">l</a>');
  it("classifies internal link targets", () => {
    const st = new Map<string, UrlStatus>([
      ["https://e.com/a", { status: 404 }],
      ["https://e.com/b", { status: 301, location: "https://e.com/b/" }],
      ["https://e.com/c", { status: 200 }],
      ["https://e.com/d", { status: null, errorCode: "TIMEOUT", error: "Request timed out" }],
    ]);
    const issues = checkInternalLinks([p], st);
    expect(ids(issues)).toEqual(["internal-link-broken", "internal-link-redirect", "internal-link-unreachable"]);
    st.set("https://e.com/d", { status: null, errorCode: "BLOCKED_PORT" });
    expect(ids(checkInternalLinks([p], st))).toEqual(["internal-link-broken", "internal-link-nonstandard", "internal-link-redirect"]);
    expect(issues.find((i) => i.id === "internal-link-broken")!.severity).toBe("critical");
  });
  it("treats 403/429 as could-not-verify, and DNS failures as broken", () => {
    const st = new Map<string, UrlStatus>([
      ["https://x.org/1", { status: 404 }],
      ["https://x.org/2", { status: 403 }],
      ["https://x.org/3", { status: 429 }],
      ["https://nx.invalid-domain.org/", { status: null, errorCode: "DNS_FAILURE" }],
      ["http://localhost/", { status: null, errorCode: "BLOCKED_HOST" }],
    ]);
    const issues = checkExternalLinks([p], st);
    expect(ids(issues)).toEqual(["external-link-broken", "external-link-dns", "external-link-private", "external-link-unverified"]);
    expect(issues.find((i) => i.id === "external-link-unverified")!.message).toContain("2 external links");
  });
});

describe("site checks", () => {
  it("https", () => {
    const ok: HttpsInfo = {
      servesHttps: true,
      httpRedirectsToHttps: true,
      hsts: "max-age=31536000",
      tls: { valid: true, daysRemaining: 60, address: "1.1.1.1", issuer: "Let's Encrypt" },
    };
    expect(checkHttps(ok, "https://e.com")).toEqual([]);
    expect(ids(checkHttps({ ...ok, httpRedirectsToHttps: false, hsts: null }, "https://e.com"))).toEqual(["hsts-missing", "http-no-redirect"]);
    expect(ids(checkHttps({ ...ok, hsts: "max-age=300" }, "https://e.com"))).toEqual(["hsts-short"]);
    expect(ids(checkHttps({ ...ok, tls: { ...ok.tls!, daysRemaining: 10 } }, "https://e.com"))).toEqual(["tls-expiring-soon"]);
    expect(ids(checkHttps({ ...ok, tls: { ...ok.tls!, daysRemaining: 20 } }, "https://e.com"))).toEqual(["tls-expiring"]);
    expect(ids(checkHttps({ ...ok, tls: { ...ok.tls!, daysRemaining: -2 } }, "https://e.com"))).toEqual(["tls-expired"]);
    expect(ids(checkHttps({ ...ok, tls: { valid: false, error: "CERT_HAS_EXPIRED", address: "1.1.1.1" } }, "https://e.com"))).toEqual(["tls-invalid"]);
    expect(ids(checkHttps({ servesHttps: false, httpRedirectsToHttps: null }, "http://e.com"))).toEqual(["https-missing"]);
  });

  it("robots", () => {
    const base = { url: "https://e.com/robots.txt", status: 200, found: true, sitemaps: ["https://e.com/s.xml"], blocksAllForEveryone: false, blocksChangeKiteBot: false };
    expect(checkRobots(base)).toEqual([]);
    expect(ids(checkRobots({ ...base, blocksAllForEveryone: true, blocksChangeKiteBot: true }))).toEqual(["robots-blocks-all"]);
    expect(ids(checkRobots({ ...base, found: false, status: 404, sitemaps: [] }))).toEqual(["robots-missing"]);
    expect(ids(checkRobots({ ...base, found: false, status: 503 }))).toEqual(["robots-server-error"]);
    expect(ids(checkRobots({ ...base, sitemaps: [] }))).toEqual(["robots-no-sitemap"]);
  });

  it("sitemap", () => {
    const base = { checked: ["https://e.com/sitemap.xml"], found: true, url: "https://e.com/sitemap.xml", urlCount: 3, childSitemaps: 0, sampled: [{ url: "https://e.com/", status: 200 }] };
    expect(checkSitemap(base, ["e.com"])).toEqual([]);
    expect(ids(checkSitemap({ ...base, found: false }, ["e.com"]))).toEqual(["sitemap-missing"]);
    expect(ids(checkSitemap({ ...base, error: "bad" }, ["e.com"]))).toEqual(["sitemap-invalid"]);
    expect(ids(checkSitemap({ ...base, urlCount: 0, sampled: [] }, ["e.com"]))).toEqual(["sitemap-empty"]);
    expect(ids(checkSitemap({ ...base, sampled: [{ url: "https://www.e.com/x", status: 404 }] }, ["e.com"]))).toEqual(["sitemap-bad-urls", "sitemap-off-host"]);
  });
});

describe("score", () => {
  it("is transparent and capped per severity", () => {
    const mk = (severity: "critical" | "warning" | "notice", n: number) =>
      Array.from({ length: n }, () => ({ id: "x", check: "titles" as const, severity, page: null, message: "", howToFix: "" }));
    expect(computeScore([]).score).toBe(100);
    expect(computeScore([...mk("critical", 1), ...mk("warning", 2), ...mk("notice", 3)]).score).toBe(100 - 10 - 6 - 3);
    expect(computeScore([...mk("critical", 50), ...mk("warning", 50), ...mk("notice", 50)]).score).toBe(0);
    expect(computeScore(mk("notice", 4)).grade).toBe("good");
    expect(computeScore(mk("critical", 1)).grade).toBe("fair");
  });
});
