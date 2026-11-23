"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Once-only section reveals. Elements with `.ck-reveal` are hidden only after this script runs
 * (html.ck-js), so without JavaScript, or under reduced motion, everything is simply visible.
 */
export function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const watch = () => {
      document.querySelectorAll(".ck-reveal:not(.is-in)").forEach((el) => {
        const r = el.getBoundingClientRect();
        // Already on screen at load: show without animating.
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("is-in");
        else io.observe(el);
      });
    };
    watch();
    root.classList.add("ck-js");
    return () => io.disconnect();
  }, [pathname]);
  return null;
}
