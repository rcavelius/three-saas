import type { SafeResponse, TlsInfo } from "@repo/security";

export type Severity = "critical" | "warning" | "notice";

export type CheckId =
  | "status"
  | "internal-links"
  | "external-links"
  | "titles"
  | "meta-description"
  | "canonical"
  | "images"
  | "sitemap"
  | "robots"
  | "https"
  | "mixed-content"
  | "crawl";

export interface Issue {
  /** Stable rule id, e.g. "title-missing". */
  id: string;
  check: CheckId;
  severity: Severity;
  /** Page the issue was found on (null for site-wide issues). */
  page: string | null;
  message: string;
  detail?: string;
  howToFix: string;
}

export interface LinkRef {
  href: string;
  text: string;
  nofollow: boolean;
}

export interface ImageRef {
  src: string;
  /** null = attribute missing; "" = decorative (valid). */
  alt: string | null;
}

export interface Subresource {
  url: string;
  tag: string;
  kind: "active" | "passive" | "form";
}

export interface CanonicalRef {
  /** Raw href as written; null when the attribute is missing. */
  raw: string | null;
  /** Absolute URL, or null if missing/unparseable. */
  resolved: string | null;
  inHead: boolean;
}

/** Facts extracted from one HTML document. Pure data, no network. */
export interface ParsedPage {
  title: string | null;
  titleCount: number;
  metaDescription: string | null;
  metaDescriptionCount: number;
  robotsDirectives: string[];
  canonicals: CanonicalRef[];
  links: LinkRef[];
  images: ImageRef[];
  subresources: Subresource[];
}

export interface CrawledPage {
  url: string;
  finalUrl: string;
  depth: number;
  status: number | null;
  error?: string;
  errorCode?: string;
  redirects: { url: string; status: number; location: string }[];
  contentType: string;
  isHtml: boolean;
  headers: Record<string, string>;
  parsed?: ParsedPage;
  /** Internal links (absolute, normalised) found on the page. */
  internalLinks: string[];
  externalLinks: string[];
}

export interface UrlStatus {
  status: number | null;
  /** Absolute Location when status is 3xx. */
  location?: string;
  error?: string;
  errorCode?: string;
}

export interface RobotsInfo {
  url: string;
  status: number | null;
  found: boolean;
  error?: string;
  sitemaps: string[];
  blocksAllForEveryone: boolean;
  blocksChangeKiteBot: boolean;
  crawlDelaySeconds?: number;
}

export interface SitemapInfo {
  checked: string[];
  found: boolean;
  url?: string;
  kind?: "urlset" | "sitemapindex";
  urlCount: number;
  childSitemaps: number;
  sampled: { url: string; status: number | null; location?: string; error?: string }[];
  error?: string;
}

export interface HttpsInfo {
  servesHttps: boolean;
  httpRedirectsToHttps: boolean | null;
  httpStatus?: number | null;
  hsts?: string | null;
  tls?: TlsInfo;
  tlsError?: string;
}

export type CheckStatus = "pass" | "warn" | "fail" | "info" | "skipped";

export interface CheckSummary {
  id: CheckId;
  label: string;
  status: CheckStatus;
  counts: Record<Severity, number>;
  summary: string;
}

export interface PageSummary {
  url: string;
  finalUrl: string;
  status: number | null;
  depth: number;
  title: string | null;
  error?: string;
}

export interface ScanReport {
  version: 1;
  startUrl: string;
  finalUrl: string;
  origin: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  limits: ScanLimits;
  stats: {
    pagesCrawled: number;
    pagesSkippedByRobots: number;
    internalUrlsFound: number;
    internalUrlsProbed: number;
    externalLinksFound: number;
    externalLinksChecked: number;
    imagesFound: number;
    pageCapReached: boolean;
    timeBudgetExhausted: boolean;
  };
  score: number;
  grade: "good" | "fair" | "poor";
  counts: Record<Severity, number>;
  checks: CheckSummary[];
  issues: Issue[];
  pages: PageSummary[];
  robots: RobotsInfo;
  sitemap: SitemapInfo;
  https: HttpsInfo;
}

export interface ScanLimits {
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  delayMs: number;
  timeBudgetMs: number;
  maxExternalLinks: number;
  maxInternalProbes: number;
  requestTimeoutMs: number;
}

export type ScanProgress =
  | { type: "phase"; phase: string; message: string }
  | { type: "page"; url: string; status: number | null; crawled: number; max: number }
  | { type: "probe"; checked: number; total: number; what: string };

export interface FetchOptions {
  method: "GET" | "HEAD";
  followRedirects?: boolean;
  maxBodyBytes?: number;
  /** Default "truncate": pages are parsed from the first maxBodyBytes. */
  onOversize?: "error" | "truncate";
  timeoutMs: number;
  signal?: AbortSignal;
}

/** Network access used by the scanner. Production wraps safeFetch/inspectTls; tests inject a loopback policy. */
export interface ScanDeps {
  fetch(url: string, options: FetchOptions): Promise<SafeResponse>;
  inspectTls(url: string, timeoutMs: number): Promise<TlsInfo>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}
