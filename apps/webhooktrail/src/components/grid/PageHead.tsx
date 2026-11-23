import Link from "next/link";
import type { ReactNode } from "react";
import { Art, type ArtName } from "./Art";
import { PixelTitle } from "./PixelTitle";

/**
 * Head of every grid page: a giant pixel word running edge to edge, then a row of cells with the
 * page's statement and (optionally) a 3D object in a black cell.
 * - Index pages: the pixel word is the h1 (`word` only).
 * - Detail pages (a tool, a guide): the pixel word names the section and links back to it, and
 *   `title` is the h1, set in heavy mono below it.
 */
export function PageHead({
  word,
  wordHref,
  title,
  lead,
  art,
  aside,
}: {
  word: string;
  wordHref?: string;
  title?: string;
  lead?: ReactNode;
  art?: ArtName;
  aside?: ReactNode;
}) {
  const big = <PixelTitle as={title ? "p" : "h1"} text={word} lines={[word]} phoneEm={Math.max(6, Math.min(9, word.length * 0.9))} max={title ? 150 : 300} maxPhone={title ? 72 : 110} />;
  return (
    <>
      <div className="g-fit wt-in border-b border-line px-4 pb-3 pt-5 md:px-5 md:pb-5 md:pt-8">
        {title && wordHref ? (
          <Link href={wordHref} className="block hover:text-signal" aria-label={`All ${word.toLowerCase()}`}>
            {big}
          </Link>
        ) : (
          big
        )}
      </div>
      <div className={`g-row grid-cols-1 ${art || aside ? "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
        <div className="g-x flex flex-col justify-center gap-4 p-4 md:p-6">
          {title && <h1 className="max-w-[24ch] text-[28px] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] md:text-[44px]">{title}</h1>}
          {lead && <div className="g-read max-w-[62ch] text-[16px] leading-[26px] text-fg-muted md:text-[17px] md:leading-[28px]">{lead}</div>}
        </div>
        {(art || aside) && (
          <div className="g-x-r theme-console relative flex items-center justify-center bg-black p-4 md:p-6">
            <span aria-hidden="true" className="g-dot -bottom-[4px] -right-[4px]" />
            {aside ?? (
              <div className="wt-float">
                <Art name={art!} sizes="160px" priority className="h-[150px] w-auto md:h-[190px]" />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
