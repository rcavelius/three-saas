import Link from "next/link";

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[13px] font-semibold tracking-tight">
      <span aria-hidden className="inline-block size-2.5 bg-signal" />
      hookpilot
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="h-12 shrink-0 border-b border-line bg-bg">
      <div className="h-full mx-auto max-w-[1600px] px-4 flex items-center gap-6">
        <Link href="/" aria-label="HookPilot home" className="rounded-sm">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-[13px] text-fg-muted">
          <Link className="px-2 py-1 rounded-sm hover:text-fg" href="/docs">
            Docs
          </Link>
          <Link className="px-2 py-1 rounded-sm hover:text-fg" href="/pricing">
            Pricing
          </Link>
        </nav>
        <div className="ml-auto hidden sm:flex items-center gap-2 font-mono text-[11px] text-fg-dim">
          <span>free tier · no account needed</span>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line text-[12px] text-fg-dim">
      <div className="mx-auto max-w-[1600px] px-4 py-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-mono">hookpilot</span>
        <Link className="hover:text-fg" href="/docs">
          Docs
        </Link>
        <Link className="hover:text-fg" href="/pricing">
          Pricing
        </Link>
        <Link className="hover:text-fg" href="/privacy">
          Privacy (draft)
        </Link>
        <Link className="hover:text-fg" href="/terms">
          Terms (draft)
        </Link>
      </div>
    </footer>
  );
}
