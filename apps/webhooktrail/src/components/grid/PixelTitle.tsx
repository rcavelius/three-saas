import type { CSSProperties, ElementType, ReactNode } from "react";

/**
 * Giant pixel display type (Silkscreen Bold) that runs edge to edge of its grid cell.
 *
 * Sizing needs no script and causes no layout shift: the advance widths of Silkscreen Bold are
 * known (table below, from the font file, 1000 units per em), so the widest line's width in em is
 * computed here and the font size is `100cqi / width`. The parent must be a size container
 * (`.g-fit`, container-type: inline-size).
 *
 * `lines` are the desktop lines. Each desktop line is split further into phone lines (spans that
 * are blocks below 640px and inline above it), so the heading is one piece of text for readers
 * and search engines at every width.
 */
const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`{|}~";
const ADV = [
  500, 500, 750, 1000, 875, 1000, 875, 500, 625, 625, 1000, 1000, 625, 750, 500, 750, 875, 750, 875, 875, 875, 875, 875, 875, 875, 875, 500, 625,
  750, 750, 750, 875, 1000, 875, 875, 875, 875, 750, 750, 875, 875, 500, 875, 875, 750, 1000, 1000, 875, 875, 875, 875, 875, 750, 875, 1000, 1000,
  1000, 1000, 750, 625, 750, 625, 750, 875, 625, 750, 500, 750, 875,
];

/** Letter spacing applied by `.wt-pixel` (keep in sync with globals.css). */
export const PIXEL_TRACKING = -0.04;

/** Advance width of a line in em at zero tracking (from the font file). */
export function pixelWidth(text: string): number {
  let w = 0;
  for (const ch of text.toUpperCase()) {
    const i = CHARS.indexOf(ch);
    w += ADV[i] ?? 875;
  }
  return w / 1000;
}

/** Rendered width in em with the display tracking (applied after every glyph, as browsers do). */
function setWidth(text: string): number {
  return pixelWidth(text) + PIXEL_TRACKING * [...text].length;
}

/** Greedy split of one line into phone lines no wider than `target` em. */
function splitLine(line: string, target: number): string[] {
  const words = line.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && setWidth(next) > target) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** Balanced split into two desktop lines when the text is long. */
function desktopLines(text: string, maxEm: number): string[] {
  if (setWidth(text) <= maxEm) return [text];
  const words = text.split(/\s+/);
  let best: string[] = [text];
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const w = Math.max(setWidth(a), setWidth(b));
    if (w < bestW) {
      bestW = w;
      best = [a, b];
    }
  }
  return best;
}

export function PixelTitle({
  text,
  lines,
  as: Tag = "h1",
  id,
  className = "",
  /** Desktop size ceiling in px. */
  max = 240,
  /** Phone size ceiling in px. */
  maxPhone = 120,
  /** Phone line width target in em before splitting. */
  phoneEm = 5.2,
  tall = false,
  children,
}: {
  text: string;
  lines?: string[];
  as?: ElementType;
  id?: string;
  className?: string;
  max?: number;
  maxPhone?: number;
  phoneEm?: number;
  /** Stretch the pixels vertically (hero use). */
  tall?: boolean;
  children?: ReactNode;
}) {
  const desk = lines ?? desktopLines(text, 16);
  const phone = desk.map((l) => splitLine(l, phoneEm));
  const wd = Math.max(...desk.map(setWidth)) + 0.02;
  const wm = Math.max(...phone.flat().map(setWidth)) + 0.02;
  const style = {
    "--px-d": `min(${max}px, calc(100cqi / ${wd.toFixed(3)}))`,
    "--px-m": `min(${maxPhone}px, calc(100cqi / ${wm.toFixed(3)}))`,
    "--ln-d": desk.length,
    "--ln-m": phone.flat().length,
  } as CSSProperties;
  return (
    <Tag id={id} className={`wt-pixel ${tall ? "wt-pixel-tall" : ""} ${className}`} style={style}>
      {phone.map((subs, i) => (
        <span key={i} className="block">
          {subs.map((s, j) => (
            <span key={j} className="wt-pixel-sub">
              {s}
              {j < subs.length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      ))}
      {children}
    </Tag>
  );
}
