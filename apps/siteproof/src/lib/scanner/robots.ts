/**
 * robots.txt parser following RFC 9309: groups by user-agent, most specific group wins (falls back to "*"),
 * longest matching rule wins, Allow wins ties, "*" wildcard and "$" end anchor supported.
 */
export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface ParsedRobots {
  groups: { agents: string[]; rules: RobotsRule[]; crawlDelay?: number }[];
  sitemaps: string[];
}

export const BOT_TOKEN = "siteproofbot";

export function parseRobots(text: string): ParsedRobots {
  const groups: ParsedRobots["groups"] = [];
  const sitemaps: string[] = [];
  let current: ParsedRobots["groups"][number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      // An empty Disallow means "allow everything" and adds no rule.
      if (value === "") continue;
      current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  return { groups, sitemaps };
}

/** Rules that apply to the given user-agent token (merged across all groups naming it), else "*". */
export function rulesFor(robots: ParsedRobots, token: string): { rules: RobotsRule[]; crawlDelay?: number; matched: "specific" | "star" | "none" } {
  const t = token.toLowerCase();
  const specific = robots.groups.filter((g) => g.agents.some((a) => a !== "*" && a.split("/")[0] === t));
  if (specific.length) {
    return {
      rules: specific.flatMap((g) => g.rules),
      crawlDelay: specific.find((g) => g.crawlDelay !== undefined)?.crawlDelay,
      matched: "specific",
    };
  }
  const star = robots.groups.filter((g) => g.agents.includes("*"));
  if (star.length) {
    return { rules: star.flatMap((g) => g.rules), crawlDelay: star.find((g) => g.crawlDelay !== undefined)?.crawlDelay, matched: "star" };
  }
  return { rules: [], matched: "none" };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

function decodeSafe(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

export function isPathAllowed(rules: RobotsRule[], pathWithQuery: string): boolean {
  const path = decodeSafe(pathWithQuery);
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    const pattern = decodeSafe(rule.pattern);
    if (!patternToRegex(pattern).test(path)) continue;
    if (!best || pattern.length > best.pattern.length || (pattern.length === best.pattern.length && rule.allow && !best.allow)) {
      best = { allow: rule.allow, pattern };
    }
  }
  return best ? best.allow : true;
}

export function blocksEverything(rules: RobotsRule[]): boolean {
  return !isPathAllowed(rules, "/") && !isPathAllowed(rules, "/index.html");
}
