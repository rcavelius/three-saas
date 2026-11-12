import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-16 sm:px-6">
      <p className="eyebrow">404</p>
      <h1 className="mt-1 text-2xl font-semibold">That page does not exist.</h1>
      <p className="mt-4">
        <Link href="/" className="btn btn-primary">
          Open the cleaner
        </Link>
      </p>
    </div>
  );
}
