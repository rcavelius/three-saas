import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPlatform } from "./platform";

/** For account pages (server components): the session, or a redirect to /login?next=<path>. */
export async function requirePageSession(path: string) {
  const p = await getPlatform();
  const h = new Headers(await headers());
  const s = await p.auth.getSession(h);
  if (!s) redirect(`/login?next=${encodeURIComponent(path)}`);
  return { p, session: s, headers: h };
}
