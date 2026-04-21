import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

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
