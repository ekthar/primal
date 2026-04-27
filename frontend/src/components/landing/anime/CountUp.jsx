import { useEffect, useRef } from "react";
import anime from "animejs";

/**
 * Animated counter. Triggers when scrolled into view; counts from 0 to `to`
 * with a custom ease curve. `format` is applied to the rendered number.
 */
export default function CountUp({
  to = 0,
  duration = 1600,
  prefix = "",
  suffix = "",
  className = "",
  format = (n) => Math.round(n).toLocaleString("en-IN"),
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.textContent = `${prefix}${format(to)}${suffix}`;
      return undefined;
    }

    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started) {
            started = true;
            const obj = { value: 0 };
            anime({
              targets: obj,
              value: to,
              duration,
              easing: "cubicBezier(.16,1,.3,1)",
              update: () => {
                el.textContent = `${prefix}${format(obj.value)}${suffix}`;
              },
            });
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [to, duration, prefix, suffix, format]);

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  );
}
