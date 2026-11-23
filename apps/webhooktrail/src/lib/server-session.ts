import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { linkViewerPasses } from "./pass";
import { getPlatform, type Platform } from "./platform";
import { getViewer, type Viewer } from "./viewer";

/** Viewer for server components (reads the request's cookies). */
export async function serverViewer(): Promise<{ p: Platform; viewer: Viewer; headers: Headers }> {
  // headers() first: it marks the page dynamic before anything touches the database.
  const h = new Headers(await headers());
  const p = await getPlatform();
  const viewer = await getViewer(p, new Request(p.appUrl, { headers: h }));
  await linkViewerPasses(p, viewer);
  return { p, viewer, headers: h };
}

/** Signed-in member of a workspace, or redirect to /login?next=... */
export async function requireMember(next: string) {
  const s = await serverViewer();
  if (!s.viewer.user || !s.viewer.org) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { ...s, user: s.viewer.user, org: s.viewer.org };
}
