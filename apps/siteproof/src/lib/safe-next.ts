/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
export function safeNext(v: string | string[] | undefined | null, fallback = "/dashboard"): string {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || typeof s !== "string") return fallback;
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\") || /[\r\n]/.test(s) || s.length > 300) return fallback;
  return s;
}

export const PAID_PLAN_IDS = ["solo", "agency"] as const;
export function safePlan(v: string | string[] | undefined | null): "solo" | "agency" | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "solo" || s === "agency" ? s : null;
}
