import { getNonce } from "@/lib/viewer";

/** JSON-LD with the request's CSP nonce; "<" is escaped so data can never close the script element. */
export async function JsonLd({ data }: { data: Record<string, unknown> }) {
  const nonce = await getNonce();
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
