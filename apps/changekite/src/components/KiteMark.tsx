/** Brand marks and sticker art. Plain SVG, no server imports, so client components can use them too. */

/** The kite mark: orange and pink panels, white spars, a tail with a bow. Works at 16px. */
export function KiteMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 36" aria-hidden="true" className={className}>
      <path d="M16 1 28 12 16 25 4 12Z" fill="var(--color-pink)" />
      <path d="M16 1 28 12H16Z M4 12H16V25Z" fill="var(--color-orange)" />
      <path d="M16 1V25M4 12H28" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 25c-2 3 2 4 0 7" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 28.5l-3.2-1.8v3.6Z M16 28.5l3.2-1.8v3.6Z" fill="var(--color-yellow)" />
    </svg>
  );
}

/** A star sticker: a fat rounded star with a dark outline, for scattering on tiles. */
export function Star({ className = "h-10 w-10", fill = "var(--color-pink)" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        d="M24 4.5c1.6 0 2.6 1 3.3 2.6l4 8.6 9.3 1.2c3.2.4 4.3 3.5 2 5.7l-6.8 6.5 1.7 9.3c.6 3.1-2.2 5.2-5 3.7L24 37.6l-8.5 4.5c-2.8 1.5-5.6-.6-5-3.7l1.7-9.3-6.8-6.5c-2.3-2.2-1.2-5.3 2-5.7l9.3-1.2 4-8.6c.7-1.6 1.7-2.6 3.3-2.6Z"
        fill={fill}
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M17 17.5c1.5-.4 2.6-1.4 3.2-2.8" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/** Motion dashes, the little comic "it's moving" lines. */
export function Whoosh({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <path d="M9 22 3 20M15 11l-3-6M25 8l1-6" stroke="var(--color-ink)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** A wavy starburst sticker holding a short label (grades, prices). */
export function Burst({ children, className = "", fill = "var(--color-yellow)" }: { children: React.ReactNode; className?: string; fill?: string }) {
  return (
    <span className={`relative inline-grid place-items-center ${className}`}>
      <svg viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
        <path
          d="M100 4c10 0 14 9 24 9s17-6 25-2 6 12 13 16 18 1 21 9-5 13-2 20 13 11 10 19-14 7-18 13-1 15-9 19-15-4-24-1-13 12-24 12-14-9-24-9-17 6-25 2-6-12-13-16-18-1-21-9 5-13 2-20-13-11-10-19 14-7 18-13 1-15 9-19 15 4 24 1 13-12 24-12Z"
          fill={fill}
          stroke="var(--color-ink)"
          strokeWidth="5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="relative px-7 py-4 text-center">{children}</span>
    </span>
  );
}
