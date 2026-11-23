import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "./guides";

export const metadata: Metadata = {
  title: "Webhook guides",
  description: "Practical guides for webhook signature verification, debugging and testing retries.",
  alternates: { canonical: "/guides" },
};

export default function GuidesIndex() {
  return (
    <div className="mx-auto w-full max-w-[78ch] px-4 py-14">
      <p className="label">Guides</p>
      <h1 className="mt-3 wt-display text-[36px] md:text-[52px]">Webhook guides</h1>
      <ul className="mt-8 grid gap-4">
        {GUIDES.map((g) => (
          <li key={g.slug} className="border border-line rounded-[14px] bg-surface p-4">
            <h2 className="text-[17px] font-semibold">
              <Link className="hover:text-signal" href={`/guides/${g.slug}`}>
                {g.title}
              </Link>
            </h2>
            <p className="mt-1 text-[14px] text-fg-muted">{g.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
