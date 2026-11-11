import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <p className="font-mono text-[13px] text-signal">404</p>
      <h1 className="mt-2 text-[24px] font-semibold">Page not found</h1>
      <p className="mt-3 text-[14px] text-fg-muted">That page does not exist.</p>
      <Link href="/" className="btn mt-6">
        Go to start
      </Link>
    </div>
  );
}
