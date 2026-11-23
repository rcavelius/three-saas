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

/** The kite mark: works at 16px. Cobalt body, a kite-orange top panel, an ink tail. */
export function KiteMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path d="M16 2 27 13 16 26 5 13Z" fill="var(--color-accent)" />
      <path d="M16 2 27 13H5Z" fill="var(--color-kite)" />
      <path d="M16 26c-1 2.4-3.4 2.6-4.6 4.4" fill="none" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const link = "rounded-full px-3 py-2 text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink";
const menuLink = "block rounded-xl px-3 py-3 text-lg font-semibold text-ink hover:bg-paper-deep";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="no-print relative z-20 border-b border-rule/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 md:h-[76px] md:px-8 lg:px-12">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline" aria-label="ChangeKite home">
          <KiteMark />
          <span className="font-display text-[1.55rem] font-bold tracking-[-0.035em] text-ink">ChangeKite</span>
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-x-0.5 whitespace-nowrap text-[0.9rem] font-semibold">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className={link}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-1 text-[0.9rem] font-semibold lg:flex">
          {viewer ? (
            <>
              <Link href="/account" className={link}>
                Account
              </Link>
              <SignOutButton className={link} />
              <Link href="/dashboard" className="btn-primary !min-h-10 !rounded-xl !px-4 !text-[0.9rem]">
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className={link}>
                Log in
              </Link>
              <Link href="/signup" className="btn-primary !min-h-10 !rounded-xl !px-4 !text-[0.9rem]">
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Phone and tablet: a plain disclosure menu (works without JavaScript). */}
        <details className="group relative lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl bg-paper-deep px-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Close</span>
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-open:rotate-45">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </summary>
          <div className="card absolute right-0 top-[calc(100%+0.5rem)] w-[min(20rem,calc(100vw-2.5rem))] p-2 shadow-[0_24px_48px_-24px_rgba(23,26,37,0.35)]">
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
                  <Link href="/dashboard" className="btn-primary !rounded-xl">
                    Dashboard
                  </Link>
                  <Link href="/account" className="btn-secondary !rounded-xl">
                    Account
                  </Link>
                  <SignOutButton className="btn-secondary !rounded-xl w-full" />
                </>
              ) : (
                <>
                  <Link href="/signup" className="btn-primary !rounded-xl">
                    Sign up
                  </Link>
                  <Link href="/login" className="btn-secondary !rounded-xl">
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
