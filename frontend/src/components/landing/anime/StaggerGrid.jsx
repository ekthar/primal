import { useEffect, useRef } from "react";
import anime from "animejs";

/**
 * Triggers an anime.js stagger reveal on direct children when scrolled
 * into view. Items rise from below with rotate, scale, and blur, on a
 * grid stagger so the entrance reads as a wave across the grid.
 */
export default function StaggerGrid({ children, className = "", grid = [3, 1], from = "first" }) {
  const rootRef = useRef(null);
  const gridKey = Array.isArray(grid) ? grid.join(",") : String(grid);
  const gridRef = useRef(grid);
  const fromRef = useRef(from);

  gridRef.current = grid;
  fromRef.current = from;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = Array.from(root.children);
    items.forEach((node) => {
      node.style.opacity = reduced ? 1 : 0;
    });
    if (reduced) return undefined;

    let played = false;
    let animation = null;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !played) {
            played = true;
            animation = anime({
              targets: items,
              opacity: [0, 1],
              translateY: [40, 0],
              rotate: [-3, 0],
              scale: [0.94, 1],
              filter: ["blur(8px)", "blur(0px)"],
              duration: 900,
              easing: "cubicBezier(.25,1,.5,1)",
              delay: anime.stagger(70, { grid: gridRef.current, from: fromRef.current }),
            });
          }
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      if (animation) animation.pause();
    };
  }, [gridKey]);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
