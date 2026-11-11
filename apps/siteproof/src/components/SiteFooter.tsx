import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="no-print mt-24 border-t border-rule">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 text-sm text-muted sm:grid-cols-[1fr_auto] sm:px-8">
        <p className="max-w-md leading-relaxed">
          SiteProof reads your public pages the way a careful crawler would, and writes down what it finds. Nothing is
          changed on your site.
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li><Link className="hover:text-ink hover:underline" href="/docs">Checks</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/pricing">Pricing</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/bot">SiteProofBot</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/privacy">Privacy</Link></li>
            <li><Link className="hover:text-ink hover:underline" href="/terms">Terms</Link></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
