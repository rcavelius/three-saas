import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { SignOutButton } from "./SignOutButton";
import { KiteMark } from "./KiteMark";

export { KiteMark } from "./KiteMark";

const NAV = [
  { href: "/docs", label: "What we check" },
  { href: "/tools", label: "Tools" },
  { href: "/guides", label: "Guides" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
];

/**
 * Desktop only: a black bar down the left edge with the name set sideways in chunky yellow type and the kite at
 * the foot. Phones and tablets get the name in the top bar instead.
 */
export function BrandBar() {
  return (
    <div className="no-print fixed inset-y-0 left-0 z-30 hidden w-[96px] flex-col items-center justify-between bg-ink py-6 lg:flex">
      <Link href="/" aria-label="ChangeKite home" className="group flex flex-1 items-center justify-center no-underline">
        <span className="sideways display text-[3.6rem] leading-none text-yellow transition-transform duration-300 group-hover:-translate-y-1">ChangeKite</span>
      </Link>
      <KiteMark className="h-12 w-12 -rotate-12" />
    </div>
  );
}

const link = "rounded-full px-3.5 py-2 text-white transition-colors hover:bg-white/15";
const menuLink = "block rounded-2xl px-4 py-3 text-lg font-extrabold text-ink hover:bg-yellow";
const cta =
  "inline-flex min-h-11 items-center rounded-full bg-yellow px-5 font-extrabold text-ink transition-transform duration-200 hover:-translate-y-0.5 hover:-rotate-1 active:scale-95";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="no-print relative z-20 bg-ink text-white">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-6 px-4 md:h-20 md:px-6 lg:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 no-underline lg:hidden" aria-label="ChangeKite home">
          <KiteMark className="h-8 w-8" />
          <span className="display text-[1.75rem] leading-none text-yellow">ChangeKite</span>
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-x-1 whitespace-nowrap text-[1rem] font-bold">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={link}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-1 text-[1rem] font-bold lg:flex">
          {viewer ? (
            <>
              <Link href="/account" className={link}>
                Account
              </Link>
              <SignOutButton className={link} />
              <Link href="/dashboard" className={cta}>
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className={link}>
                Log in
              </Link>
              <Link href="/signup" className={cta}>
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Phone and tablet: a plain disclosure menu (works without JavaScript). */}
        <details className="group relative lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-yellow px-5 font-extrabold text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Close</span>
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-open:rotate-45">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </summary>
          <div className="absolute right-0 top-[calc(100%+0.5rem)] w-[min(20rem,calc(100vw-2rem))] rounded-[28px] bg-white p-2 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
            <ul>
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className={menuLink}>
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid gap-2 p-2 pt-3">
              {viewer ? (
                <>
                  <Link href="/dashboard" className="btn-primary">
                    Dashboard
                  </Link>
                  <Link href="/account" className="btn-secondary">
                    Account
                  </Link>
                  <SignOutButton className="btn-secondary w-full" />
                </>
              ) : (
                <>
                  <Link href="/signup" className="btn-primary">
                    Sign up
                  </Link>
                  <Link href="/login" className="btn-secondary">
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
