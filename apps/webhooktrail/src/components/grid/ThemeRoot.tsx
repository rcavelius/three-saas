"use client";

import { usePathname } from "next/navigation";

/**
 * Marketing and reading pages use the light "grid" theme; the working app (inspector, dashboard,
 * account, admin, auth) keeps the dark console. The theme is a class that re-declares the colour
 * tokens, so every component follows it. usePathname is known during server rendering, so the
 * right theme is in the first HTML (no flash).
 */
const GRID = [/^\/$/, /^\/pricing/, /^\/tools/, /^\/guides/, /^\/docs/, /^\/help/, /^\/privacy/, /^\/terms/, /^\/support\/?$/];

export function isGridPath(path: string): boolean {
  return GRID.some((r) => r.test(path));
}

export function ThemeRoot({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  const grid = isGridPath(path);
  return <div className={`${grid ? "theme-grid" : "theme-console-root"} flex min-h-dvh flex-col bg-bg text-fg`}>{children}</div>;
}
