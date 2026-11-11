/** Public site URL (APP_URL) for canonical links, sitemap and JSON-LD. Server-side only. */
export function appUrl(): string {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3002").origin;
  } catch {
    return "http://localhost:3002";
  }
}
