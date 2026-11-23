"use client";

import { useEffect, useRef } from "react";

/** 0-100 score ring. Server HTML shows the final arc; on the client the arc draws in once (Web Animations), skipped under reduced motion. */
export type Grade = "good" | "fair" | "poor";

const GRADE_STROKE: Record<Grade, string> = {
  good: "var(--color-pass)",
  fair: "#b56b00",
  poor: "var(--color-fail)",
};

export function ScoreDial({
  score,
  grade,
  size = 112,
  animate = true,
  delayMs = 300,
  label,
}: {
  score: number;
  grade: Grade;
  size?: number;
  animate?: boolean;
  delayMs?: number;
  label?: string;
}) {
  const stroke = size >= 150 ? 12 : 10;
  const r = (size - stroke) / 2;
  // pathLength=100 makes the dash maths independent of size: offset 100 = empty, 0 = full.
  const offset = 100 - Math.max(0, Math.min(100, score));
  const arc = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const el = arc.current;
    if (!animate || !el || typeof el.animate !== "function" || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = el.animate([{ strokeDashoffset: 100 }, { strokeDashoffset: offset }], {
      duration: 1200,
      delay: delayMs,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "backwards",
    });
    return () => a.cancel();
    // Draw once on mount only; later score changes use the CSS transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `Score ${score} out of 100`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-paper-deep)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={GRADE_STROKE[grade]}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100 100"
          strokeDashoffset={offset}
          ref={arc}
          style={{ transition: "stroke-dashoffset 500ms cubic-bezier(0.22, 1, 0.36, 1), stroke 300ms" }}
        />
      </svg>
      <span
        aria-hidden="true"
        className="num font-display absolute inset-0 grid place-items-center leading-none tracking-[-0.02em] text-ink"
        style={{ fontSize: Math.round(size * (size < 100 ? 0.5 : 0.42)) }}
      >
        {score}
      </span>
    </div>
  );
}
