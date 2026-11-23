import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-24 sm:px-8">
      <p className="eyebrow num">404</p>
      <h1 className="mt-3 display text-[2.6rem]">Nothing on file here</h1>
      <p className="mt-4 text-lg text-ink-soft">
        This page does not exist, or the report has expired and been deleted.
      </p>
      <p className="mt-8">
        <Link href="/" className="text-accent underline underline-offset-4">
          Run a new inspection
        </Link>
      </p>
    </div>
  );
}
