"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A short silent explainer loop. Nothing from it downloads with the page: the still frame (an <img> under
 * the video) and the video both start loading only when the loop comes within 120 px of the viewport. A
 * `poster` attribute or a native lazy <img> would be fetched at page load next to the fonts and CSS, which
 * slows the first paint on phones. The video plays only while visible; with prefers-reduced-motion it never
 * plays and the still frame stays. Without JavaScript the <noscript> still frame shows.
 * `src` is the path without extension; `<src>.webm` and `<src>.mp4` must both exist.
 */
export function LoopVideo({ src, poster, width, height, className }: { src: string; poster: string; width: number; height: number; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);

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
        if (visible) setNear(true);
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
    <div className={`relative ${className ?? ""}`} style={{ aspectRatio: `${width} / ${height}` }}>
      {near ? (
        <img src={poster} alt="" width={width} height={height} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <noscript>
          <img src={poster} alt="" width={width} height={height} className="absolute inset-0 h-full w-full object-cover" />
        </noscript>
      )}
      <video ref={ref} muted loop playsInline preload="none" width={width} height={height} aria-hidden="true" tabIndex={-1} className="absolute inset-0 h-full w-full object-cover">
        <source src={`${src}.webm`} type="video/webm" />
        <source src={`${src}.mp4`} type="video/mp4" />
      </video>
    </div>
  );
}
