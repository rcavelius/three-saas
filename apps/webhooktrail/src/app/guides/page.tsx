import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "./guides";
import { PageHead } from "@/components/grid/PageHead";

export const metadata: Metadata = {
  title: "Webhook guides",
  description: "Practical guides for webhook signature verification, debugging and testing retries.",
  alternates: { canonical: "/guides" },
};

export default function GuidesIndex() {
  return (
    <div className="g-frame">
      <PageHead word="Webhook guides" art="hook" lead={<p>Signatures, retries and replay, step by step, with real captured requests.</p>} />
      <ul className="g-row grid-cols-1 md:grid-cols-3">
        {GUIDES.map((g) => (
          <li key={g.slug} className="g-x">
            <Link href={`/guides/${g.slug}`} className="g-link flex h-full min-h-[220px] flex-col justify-between gap-6 p-4 md:p-6">
              <span>
                <h2 className="text-[17px] font-bold uppercase leading-[24px] tracking-[0.01em]">{g.title}</h2>
                <p className="g-mute g-read mt-3 text-[14.5px] leading-[23px] text-fg-muted">{g.description}</p>
              </span>
              <span className="g-mute flex items-center justify-between font-mono text-[12px] text-fg-dim">
                Updated {g.updated}
                <span aria-hidden="true" className="arr">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
