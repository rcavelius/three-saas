/**
 * The 3D art (Higgsfield gpt_image_2_6 renders, background removed; sources and job ids in
 * docs/design/v2/webhooktrail/art/). Served as AVIF with a WebP fallback, two widths each,
 * with intrinsic sizes so nothing shifts while it loads.
 */
const ART = {
  mascot: { sizes: [[322, 600], [536, 1000]], alt: "WebhookTrail's mascot: a cream toy robot with a hook antenna, its orange screen reading POST /hook 200" },
  hook: { sizes: [[320, 583], [560, 1020]], alt: "" },
  packet: { sizes: [[320, 291], [560, 510]], alt: "" },
} as const;

export type ArtName = keyof typeof ART;

export function Art({
  name,
  sizes,
  className = "",
  priority = false,
  alt,
}: {
  name: ArtName;
  /** The `sizes` attribute: the displayed CSS width. */
  sizes: string;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  const a = ART[name];
  const set = (ext: string) => a.sizes.map(([w, h]) => `/art/${name}-${w}x${h}.${ext} ${w}w`).join(", ");
  const [w, h] = a.sizes[1];
  return (
    <picture>
      <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={set("webp")} sizes={sizes} />
      <img
        src={`/art/${name}-${w}x${h}.webp`}
        width={w}
        height={h}
        alt={alt ?? a.alt}
        className={className}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        draggable={false}
      />
    </picture>
  );
}
