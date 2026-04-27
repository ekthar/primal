import { useEffect, useRef } from "react";
import anime from "animejs";

/**
 * Wraps a child element with a magnetic cursor pull on pointer move,
 * snapping back on leave. Disabled under reduced-motion / coarse pointers.
 */
export default function MagneticCTA({ children, strength = 22, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return undefined;

    const onMove = (event) => {
      const rect = el.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * strength;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * strength;
      anime({
        targets: el,
        translateX: x,
        translateY: y,
        duration: 320,
        easing: "easeOutQuad",
      });
    };
    const onLeave = () => {
      anime({
        targets: el,
        translateX: 0,
        translateY: 0,
        duration: 540,
        easing: "easeOutElastic(1, .6)",
      });
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [strength]);

  return (
    <div ref={ref} className={`inline-block will-change-transform ${className}`}>
      {children}
    </div>
  );
}
