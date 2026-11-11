import { describe, it, expect } from "vitest";
import { blocksEverything, isPathAllowed, parseRobots, rulesFor, BOT_TOKEN } from "./robots";

const TXT = `
# comment
User-agent: Googlebot
Disallow: /nogoogle

User-agent: *
Disallow: /private
Disallow: /*.pdf$
Allow: /private/public
Crawl-delay: 2

User-agent: SiteProofBot
User-agent: otherbot
Disallow: /admin
Allow: /

Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/news.xml
`;

describe("robots.txt", () => {
  const parsed = parseRobots(TXT);

  it("collects sitemaps and groups", () => {
    expect(parsed.sitemaps).toEqual(["https://example.com/sitemap.xml", "https://example.com/news.xml"]);
    expect(parsed.groups).toHaveLength(3);
    expect(parsed.groups[2]!.agents).toEqual(["siteproofbot", "otherbot"]);
  });

  it("uses the most specific group for our bot", () => {
    const mine = rulesFor(parsed, BOT_TOKEN);
    expect(mine.matched).toBe("specific");
    expect(isPathAllowed(mine.rules, "/private")).toBe(true);
    expect(isPathAllowed(mine.rules, "/admin/users")).toBe(false);
  });

  it("applies longest match, Allow wins ties, wildcards and $", () => {
    const star = rulesFor(parsed, "somebot");
    expect(star.matched).toBe("star");
    expect(star.crawlDelay).toBe(2);
    expect(isPathAllowed(star.rules, "/private/x")).toBe(false);
    expect(isPathAllowed(star.rules, "/private/public/page")).toBe(true);
    expect(isPathAllowed(star.rules, "/files/a.pdf")).toBe(false);
    expect(isPathAllowed(star.rules, "/files/a.pdf?x=1")).toBe(true);
    expect(isPathAllowed(star.rules, "/")).toBe(true);
  });

  it("detects a whole-site block", () => {
    const r = parseRobots("User-agent: *\nDisallow: /\n");
    expect(blocksEverything(rulesFor(r, "*").rules)).toBe(true);
    expect(blocksEverything(rulesFor(r, BOT_TOKEN).rules)).toBe(true);
    const empty = parseRobots("User-agent: *\nDisallow:\n");
    expect(blocksEverything(rulesFor(empty, "*").rules)).toBe(false);
  });

  it("treats a missing file / no groups as allow-all", () => {
    const r = parseRobots("");
    expect(rulesFor(r, BOT_TOKEN).matched).toBe("none");
    expect(isPathAllowed([], "/anything")).toBe(true);
  });
});
