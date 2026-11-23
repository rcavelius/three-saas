import Link from "next/link";
import { SignOutButton } from "./auth/AuthForms";

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[13px] font-semibold tracking-tight">
      <span aria-hidden className="inline-block size-2.5 bg-signal" />
      webhooktrail
    </span>
  );
}

export function SiteHeader({ signedIn, operator }: { signedIn: boolean; operator?: boolean }) {
  return (
    <header className="h-12 shrink-0 border-b border-line bg-bg">
      <div className="h-full mx-auto max-w-[1600px] px-4 flex items-center gap-3 sm:gap-6">
        <Link href="/" aria-label="WebhookTrail home" className="rounded-sm">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-[13px] text-fg-muted">
          <Link className="px-2 py-1 rounded-sm hover:text-fg" href="/docs">
            Docs
          </Link>
          <Link className="px-2 py-1 rounded-sm hover:text-fg" href="/pricing">
            Pricing
          </Link>
          <Link className="hidden min-[420px]:inline px-2 py-1 rounded-sm hover:text-fg" href="/tools">
            Tools
          </Link>
          <Link className="hidden sm:inline px-2 py-1 rounded-sm hover:text-fg" href="/guides">
            Guides
          </Link>
          <Link className="hidden sm:inline px-2 py-1 rounded-sm hover:text-fg" href="/help">
            Help
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1 text-[13px]">
          {signedIn ? (
            <>
              {operator && (
                <Link className="hidden sm:inline px-2 py-1 rounded-sm text-fg-muted hover:text-fg" href="/admin">
                  Ops
                </Link>
              )}
              <Link className="px-2 py-1 rounded-sm text-fg-muted hover:text-fg" href="/app">
                Dashboard
              </Link>
              <Link className="hidden sm:inline px-2 py-1 rounded-sm text-fg-muted hover:text-fg" href="/account">
                Account
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link className="px-2 py-1 rounded-sm text-fg-muted hover:text-fg" href="/login">
                Log in
              </Link>
              <Link className="btn h-7" href="/signup">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line text-[12px] text-fg-dim">
      <div className="mx-auto max-w-[1600px] px-4 py-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-mono">webhooktrail</span>
        <Link className="hover:text-fg" href="/docs">
          Docs
        </Link>
        <Link className="hover:text-fg" href="/tools">
          Tools
        </Link>
        <Link className="hover:text-fg" href="/guides">
          Guides
        </Link>
        <Link className="hover:text-fg" href="/pricing">
          Pricing
        </Link>
        <Link className="hover:text-fg" href="/help">
          Help center
        </Link>
        <Link className="hover:text-fg" href="/support">
          Contact support
        </Link>
        <Link className="hover:text-fg" href="/privacy">
          Privacy
        </Link>
        <Link className="hover:text-fg" href="/terms">
          Terms
        </Link>
      </div>
    </footer>
  );
}
