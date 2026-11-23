import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { SignOutButton } from "./SignOutButton";

const NAV = [
  { href: "/docs", label: "What we check" },
  { href: "/tools", label: "Tools" },
  { href: "/guides", label: "Guides" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
];

/** The kite mark: a vermilion kite with its cross spars and a two-bow tail. Works at 16px. */
export function KiteMark({ className = "h-8 w-8", tail = "#fff" }: { className?: string; tail?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path d="M17 1.5 27.5 11.5 17 24 6.5 11.5Z" fill="var(--color-kite)" />
      <path d="M17 1.5 27.5 11.5H17Z M6.5 11.5H17V24Z" fill="var(--color-kite-deep)" />
      <path d="M17 24c-1.6 2.6-4.2 1.6-5.8 3.6S8.5 31 6 30.5" fill="none" stroke={tail} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11.2 27.6l-2.2-1.4.4 2.6Z M11.2 27.6l2.3 1.2-.6-2.5Z" fill={tail} />
    </svg>
  );
}

const link = "rounded-full px-3.5 py-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white";
const menuLink = "block rounded-2xl px-4 py-3 text-lg font-bold text-ink hover:bg-paper-deep";
const cta = "inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[0.95rem] font-bold text-ink transition-transform hover:scale-[1.03] active:scale-95";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="no-print relative z-20 bg-sky text-white">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-6 px-5 md:h-20 md:px-8 lg:px-12">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline" aria-label="ChangeKite home">
          <KiteMark />
          <span className="display text-[1.45rem] !leading-none text-white">ChangeKite</span>
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-x-0.5 whitespace-nowrap text-[0.95rem] font-semibold">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={link}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-1 text-[0.95rem] font-semibold lg:flex">
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
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-white/15 px-5 font-bold text-white [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Close</span>
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-open:rotate-45">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </summary>
          <div className="absolute right-0 top-[calc(100%+0.5rem)] w-[min(20rem,calc(100vw-2.5rem))] rounded-3xl bg-white p-2 text-ink shadow-[0_24px_60px_-20px_rgba(7,12,34,0.5)]">
            <ul>
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className={menuLink}>
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid gap-2 border-t border-rule p-2 pt-4">
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
