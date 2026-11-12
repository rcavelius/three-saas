const SKIP_SCHEMES = /^(mailto|tel|sms|javascript|data|blob|about|ftp|file|whatsapp|skype|callto|geo|market|intent):/i;

/** File extensions that are links to assets/downloads rather than crawlable pages. */
const ASSET_EXT =
  /\.(pdf|zip|gz|tgz|rar|7z|tar|dmg|exe|msi|apk|jpg|jpeg|png|gif|webp|avif|svg|ico|bmp|tiff?|mp3|mp4|m4a|m4v|mov|avi|webm|ogg|wav|flac|css|js|mjs|json|xml|txt|csv|xlsx?|docx?|pptx?|woff2?|ttf|otf|eot)$/i;

/** Resolves an href against a base and normalises it (no fragment). Returns null for non-http(s) or invalid hrefs. */
export function resolveHref(href: string | undefined | null, base: string): string | null {
  if (href == null) return null;
  const h = href.trim();
  if (!h || h.startsWith("#") || SKIP_SCHEMES.test(h)) return null;
  try {
    const u = new URL(h, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

export function normalizeUrl(input: string): string {
  const u = new URL(input);
  u.hash = "";
  return u.href;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isAssetUrl(url: string): boolean {
  try {
    return ASSET_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function pathAndQuery(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
