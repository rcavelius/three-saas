import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHANGEKITE_CATALOG } from "@repo/billing";
import { CHECK_ORDER } from "@/lib/scanner/score";
import { FREE_LIMITS } from "@/lib/scanner/scan";
import { CHECK_DOCS } from "@/lib/check-docs";
import { sitemapPaths } from "@/lib/sitemap-paths";
import { TOOLS } from "./tools";

const src = fileURLToPath(new URL("..", import.meta.url));
const checksSource = readdirSync(join(src, "lib/scanner/checks"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => readFileSync(join(src, "lib/scanner/checks", f), "utf8"))
  .join("\n");
const diffSource = readFileSync(join(src, "lib/monitoring/diff.ts"), "utf8");

/** All visible copy of a page. */
const copy = (t: (typeof TOOLS)[number]) => [t.title, t.h1, t.description, t.intro, ...t.howTo, ...t.faq.flatMap((f) => [f.q, f.a])].join("\n");

describe("tool landing pages", () => {
  it("have 8-20 pages with unique slugs and search-sized titles and descriptions", () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(8);
    expect(TOOLS.length).toBeLessThanOrEqual(20);
    expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((t) => t.title)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.title.length, t.slug).toBeLessThanOrEqual(70);
      expect(t.title.length, t.slug).toBeGreaterThan(20);
      expect(t.description.length, t.slug).toBeGreaterThan(80);
      expect(t.description.length, t.slug).toBeLessThanOrEqual(170);
      expect(t.howTo.length).toBeGreaterThanOrEqual(3);
      expect(t.faq.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("only name checks the scanner runs, each with a /docs explanation", () => {
    for (const t of TOOLS) {
      expect(t.checks.length, t.slug).toBeGreaterThan(0);
      for (const c of t.checks) {
        expect(CHECK_ORDER, `${t.slug}: ${c}`).toContain(c);
        expect(CHECK_DOCS.map((d) => d.id), `${t.slug}: ${c}`).toContain(c);
      }
    }
  });

  it("only quote issue rules that exist in the scanner checks", () => {
    for (const t of TOOLS) {
      expect(t.rules.length, t.slug).toBeGreaterThan(0);
      for (const r of t.rules) expect(checksSource.includes(`"${r}"`), `${t.slug}: rule ${r}`).toBe(true);
    }
  });

  it("monitoring pages only promise alerts that detectChanges emits, and are marked paid", () => {
    for (const t of TOOLS.filter((x) => x.alertKinds)) {
      expect(t.paid, t.slug).toBe(true);
      for (const k of t.alertKinds!) expect(diffSource.includes(`kind: "${k}"`), `${t.slug}: ${k}`).toBe(true);
    }
    // A page that sells monitoring must say which alerts it sends.
    for (const t of TOOLS.filter((x) => x.paid)) expect(t.alertKinds?.length, t.slug).toBeGreaterThan(0);
  });

  it("quote only prices, frequencies, site counts and page limits from the catalog and FREE_LIMITS", () => {
    const paid = CHANGEKITE_CATALOG.plans.filter((p) => p.priceMonthlyCents > 0);
    const prices = new Set([
      ...paid.map((p) => `$${(p.priceMonthlyCents / 100).toFixed(p.priceMonthlyCents % 100 ? 2 : 0)}`),
      ...(CHANGEKITE_CATALOG.passes ?? []).map((p) => `$${(p.priceCents / 100).toFixed(p.priceCents % 100 ? 2 : 0)}`),
    ]);
    const hours = new Set(paid.map((p) => String(p.limits.scanFrequencyHours)));
    const sites = new Set(paid.map((p) => String(p.limits.sites)));
    const pages = new Set([...CHANGEKITE_CATALOG.plans.map((p) => p.limits.pagesPerScan!.toLocaleString("en-US")), String(FREE_LIMITS.maxPages)]);
    for (const t of TOOLS) {
      const text = copy(t);
      for (const m of text.matchAll(/\$\d[\d,.]*/g)) expect(prices, `${t.slug}: ${m[0]}`).toContain(m[0]);
      for (const m of text.matchAll(/every (\d+) hours/g)) expect(hours, `${t.slug}: ${m[0]}`).toContain(m[1]);
      for (const m of text.matchAll(/(\d+) sites?\b/g)) expect(sites, `${t.slug}: ${m[0]}`).toContain(m[1]);
      for (const m of text.matchAll(/up to ([\d,]+) pages/gi)) expect(pages, `${t.slug}: ${m[0]}`).toContain(m[1]);
      for (const m of text.matchAll(/(\d+) clicks deep/g)) expect(m[1]).toBe(String(FREE_LIMITS.maxDepth));
      for (const m of text.matchAll(/up to (\d+) unique outbound/g)) expect(m[1]).toBe(String(FREE_LIMITS.maxExternalLinks));
    }
    // The monitoring pages do quote the real plans.
    const monitoring = copy(TOOLS.find((t) => t.slug === "website-change-monitoring")!);
    for (const p of paid) {
      expect(monitoring).toContain(p.name);
      expect(monitoring).toContain(`every ${p.limits.scanFrequencyHours} hours`);
    }
  });

  it("the free scan limits quoted match the scanner", () => {
    const blc = copy(TOOLS.find((t) => t.slug === "broken-link-checker")!);
    expect(blc).toContain(`up to ${FREE_LIMITS.maxPages} pages`);
    expect(blc).toContain(`Up to ${FREE_LIMITS.maxExternalLinks} unique outbound links`);
  });

  it("free tool pages say the free report is a summary with the top issues, and quote the pass from the catalog", () => {
    const pass = CHANGEKITE_CATALOG.passes!.find((p) => p.id === "report")!;
    const free = CHANGEKITE_CATALOG.plans.find((p) => p.id === CHANGEKITE_CATALOG.freePlanId)!;
    for (const t of TOOLS.filter((x) => !x.paid)) {
      const text = copy(t);
      expect(text, t.slug).toContain(`${free.limits.reportIssues} most severe issues`);
      expect(text, t.slug).toContain(`$${pass.priceCents / 100} once`);
      expect(text, t.slug).toContain(`${pass.durationHours / 24} days`);
      // No claim that the free scan lists everything.
      expect(text, t.slug).not.toMatch(/free scan (that )?lists every/i);
    }
  });

  it("the HTTPS pages quote the real HSTS threshold and severities", () => {
    const site = readFileSync(join(src, "lib/scanner/checks/site.ts"), "utf8");
    expect(site).toContain("15_552_000");
    const hsts = copy(TOOLS.find((t) => t.slug === "hsts-header-checker")!);
    expect(hsts).toContain("15,552,000");
    expect(hsts).toContain("max-age=31536000");
    expect(copy(TOOLS.find((t) => t.slug === "http-to-https-redirect-checker")!)).toContain("301/308");
    expect(site).toContain("301/308");
  });

  it("the noindex/canonical page matches the canonical check", () => {
    const canon = readFileSync(join(src, "lib/scanner/checks/canonical.ts"), "utf8");
    expect(canon).toContain("if (noindex && !self)");
    expect(canon).toContain('severity: "critical"');
    const page = copy(TOOLS.find((t) => t.slug === "noindex-canonical-conflict-checker")!);
    expect(page).toContain("noindex");
    expect(page).toContain("self-referencing");
  });

  it("the sitemap URL page matches the sitemap check", () => {
    const site = readFileSync(join(src, "lib/scanner/checks/site.ts"), "utf8");
    expect(site).toContain("s.status === null || s.status >= 300");
    expect(site).toContain("location");
    const page = copy(TOOLS.find((t) => t.slug === "sitemap-urls-redirect-or-404-checker")!);
    expect(page).toContain("does not return 200");
    expect(page).toContain("up to five");
  });

  it("the status code page only claims what the status check does", () => {
    const links = readFileSync(join(src, "lib/scanner/checks/links.ts"), "utf8");
    expect(links).toContain("status >= 400");
    expect(links).toContain("p.redirects.length >= 2");
    const t = TOOLS.find((x) => x.slug === "website-status-code-checker")!;
    expect(t.checks).toEqual(["status"]);
    expect(copy(t)).toContain("400 or higher");
    expect(copy(t)).toContain("two or more redirects");
    // Continuous monitoring is a paid-plan feature, never promised for the free scan.
    expect(copy(t)).toContain("one-off");
    expect(diffSource).toContain('kind: "site_down"');
  });

  it("the duplicate titles page matches the titles check", () => {
    const content = readFileSync(join(src, "lib/scanner/checks/content.ts"), "utf8");
    expect(content).toContain("t.toLowerCase()");
    expect(content).toContain("if (urls.length < 2) continue;");
    expect(content).toContain("!isNoindex(p.parsed!.robotsDirectives)");
    expect(content).toContain("and ${urls.length - max} more");
    const t = TOOLS.find((x) => x.slug === "duplicate-page-titles-checker")!;
    expect(t.checks).toEqual(["titles"]);
    expect(copy(t)).toContain("case-insensitively");
    expect(copy(t)).toContain("noindex");
  });

  it("every tool page and the index are in the sitemap", () => {
    const paths = sitemapPaths({ published: false }).map((p) => p.path);
    expect(paths).toContain("/tools");
    for (const t of TOOLS) expect(paths).toContain(`/tools/${t.slug}`);
    expect(new Set(paths).size).toBe(paths.length);
    // Legal pages join the sitemap only once published.
    expect(paths).not.toContain("/terms");
    expect(sitemapPaths({ published: true }).map((p) => p.path)).toEqual(expect.arrayContaining(["/terms", "/privacy"]));
  });
});
