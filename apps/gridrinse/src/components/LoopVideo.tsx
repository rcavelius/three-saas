"use client";

import { useEffect, useRef } from "react";

/**
 * A short silent explainer loop. Nothing is downloaded until it is near the viewport, it plays only while
 * visible, and with prefers-reduced-motion it never plays: the poster frame stays as a still picture.
 * `src` is the path without extension; `<src>.webm` and `<src>.mp4` must both exist.
 */
export function LoopVideo({ src, poster, width, height, className }: { src: string; poster: string; width: number; height: number; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const sync = () => {
      if (visible && !still.matches) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        sync();
      },
      { rootMargin: "120px" },
    );
    io.observe(v);
    still.addEventListener("change", sync);
    return () => {
      io.disconnect();
      still.removeEventListener("change", sync);
    };
  }, []);

  return (
    <video ref={ref} muted loop playsInline preload="none" poster={poster} width={width} height={height} aria-hidden="true" tabIndex={-1} className={className}>
      <source src={`${src}.webm`} type="video/webm" />
      <source src={`${src}.mp4`} type="video/mp4" />
    </video>
  );
}
