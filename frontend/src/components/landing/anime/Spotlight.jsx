import { useEffect, useRef } from "react";

/**
 * Spotlight — a soft radial spotlight that follows the pointer over the
 * parent. Uses a single GPU layer with mix-blend-screen so it brightens
 * content without clipping. mix-blend-screen looks subtle on light themes
 * and lifts highlights nicely on dark themes.
 *
 * On touch devices and reduced-motion, the spotlight slow-drifts on a
 * Lissajous path instead of tracking the pointer, so it still feels alive.
 *
 * Place this absolutely-positioned element inside a `relative` container.
 */
export default function Spotlight({
  className = "",
  size = 480,
  color = "rgba(255, 255, 255, 0.32)",
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const host = el.parentElement;
    if (!host) return undefined;

    let raf = 0;

    if (reduced || coarse) {
      // Slow Lissajous drift, ignores pointer.
      const start = performance.now();
      const tick = (now) => {
        const t = (now - start) / 1000;
        const rect = host.getBoundingClientRect();
        const w = rect.width || window.innerWidth;
        const h = rect.height || window.innerHeight;
        const cx = w / 2 + Math.sin(t * 0.15) * (w * 0.22);
        const cy = h / 2 + Math.cos(t * 0.18) * (h * 0.18);
        el.style.setProperty("--spot-x", `${cx}px`);
        el.style.setProperty("--spot-y", `${cy}px`);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let initialized = false;

    const onMove = (event) => {
      const rect = host.getBoundingClientRect();
      const x = (event.clientX ?? event.touches?.[0]?.clientX ?? 0) - rect.left;
      const y = (event.clientY ?? event.touches?.[0]?.clientY ?? 0) - rect.top;
      targetX = x;
      targetY = y;
      if (!initialized) {
        curX = x;
        curY = y;
        initialized = true;
      }
    };

    const tick = () => {
      // Critically damped follow.
      curX += (targetX - curX) * 0.12;
      curY += (targetY - curY) * 0.12;
      el.style.setProperty("--spot-x", `${curX}px`);
      el.style.setProperty("--spot-y", `${curY}px`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("touchmove", onMove, { passive: true });
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("touchmove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 mix-blend-screen ${className}`}
      style={{
        ["--spot-x"]: "50%",
        ["--spot-y"]: "50%",
        background: `radial-gradient(${size}px circle at var(--spot-x) var(--spot-y), ${color} 0%, transparent 60%)`,
      }}
    />
  );
}
