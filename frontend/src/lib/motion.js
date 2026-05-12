import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/* ─── Central motion constants ────────────────────────────────
   Use these instead of magic numbers for every framer-motion
   and CSS transition throughout the app.
   Syncs with design_guidelines.json → motion section.         */

export const EASING = {
  ios: [0.25, 1, 0.5, 1],
  spring: [0.34, 1.56, 0.64, 1],
  out: [0.16, 1, 0.3, 1],
  in: "easeIn",
};

export const DURATION = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
  route: 0.22,
};

export const SPRING = {
  gentle: { type: "spring", stiffness: 300, damping: 25 },
  snappy: { type: "spring", stiffness: 500, damping: 30 },
  bouncy: { type: "spring", stiffness: 400, damping: 15 },
};

/* ─── Variant presets for AnimatePresence pages ─────────────── */
export const pageSlide = {
  initial: { opacity: 0, y: 6 },
  enter: { opacity: 1, y: 0, transition: { duration: DURATION.route, ease: EASING.ios } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: EASING.in } },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base, ease: EASING.ios } },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASING.ios } },
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASING.ios } },
};

/* ─── Hook ──────────────────────────────────────────────────── */
export function useMotionProfile() {
  const reducedMotion = useReducedMotion();
  const [viewportWidth, setViewportWidth] = useState(1440);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  const isPhone = viewportWidth < 640;
  const isTablet = viewportWidth >= 640 && viewportWidth < 1024;
  const allowContinuousMotion = !reducedMotion && viewportWidth >= 768;
  const allowCinematicMotion = !reducedMotion && viewportWidth >= 1024;

  return {
    reducedMotion,
    viewportWidth,
    isPhone,
    isTablet,
    allowContinuousMotion,
    allowCinematicMotion,
  };
}
