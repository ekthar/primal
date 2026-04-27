import { useEffect, useRef } from "react";
import anime from "animejs";

const defaultFormat = (n) => Math.round(n).toLocaleString("en-IN");

/**
 * Animated counter. Triggers when scrolled into view; counts from 0 to `to`
 * with a custom ease curve. `format` is applied to the rendered number.
 *
 * `format`, `prefix`, and `suffix` are stored in refs so callers can pass
 * inline closures without re-running the effect or restarting the animation.
 */
export default function CountUp({
  to = 0,
  duration = 1600,
  prefix = "",
  suffix = "",
  className = "",
  format = defaultFormat,
}) {
  const ref = useRef(null);
  const formatRef = useRef(format);
  const prefixRef = useRef(prefix);
  const suffixRef = useRef(suffix);

  formatRef.current = format;
  prefixRef.current = prefix;
  suffixRef.current = suffix;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.textContent = `${prefixRef.current}${formatRef.current(to)}${suffixRef.current}`;
      return undefined;
    }

    let started = false;
    let animation = null;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started) {
            started = true;
            const obj = { value: 0 };
            animation = anime({
              targets: obj,
              value: to,
              duration,
              easing: "cubicBezier(.16,1,.3,1)",
              update: () => {
                el.textContent = `${prefixRef.current}${formatRef.current(obj.value)}${suffixRef.current}`;
              },
            });
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (animation) animation.pause();
    };
  }, [to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  );
}
