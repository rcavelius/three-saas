/** Intrinsic sizes of the served files, so every <img> reserves the right box before it loads. */
const SIZES = {
  mascot: [640, 546],
  "mascot-sm": [360, 307],
  "mascot-wave": [480, 477],
  lock: [240, 336],
  sheet: [240, 310],
  bubbles: [240, 263],
  trophy: [240, 276],
} as const;

export type ArtName = keyof typeof SIZES;

/** A Higgsfield 3D cut-out from /public/art, served as AVIF with a WebP fallback. Decorative unless `alt` is given. */
export function Art({ name, className = "", eager = false, alt = "" }: { name: ArtName; className?: string; eager?: boolean; alt?: string }) {
  const [w, h] = SIZES[name];
  return (
    <picture>
      <source srcSet={`/art/${name}.avif`} type="image/avif" />
      <img src={`/art/${name}.webp`} alt={alt} width={w} height={h} loading={eager ? "eager" : "lazy"} decoding="async" className={className} />
    </picture>
  );
}
