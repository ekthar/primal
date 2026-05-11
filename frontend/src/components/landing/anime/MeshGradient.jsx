import { useEffect, useRef } from "react";

/**
 * MeshGradient — three soft radial gradients drifting on independent slow
 * loops. Pure CSS / DOM, no canvas, no extra deps. The drift is driven by a
 * `requestAnimationFrame` loop that pauses when off-screen.
 *
 * Designed to sit BEHIND the existing Three.js cage canvas to add ambient
 * depth without competing for attention. Inherits `currentColor` for fallback
 * use; pass tint colors via the `colors` prop.
 *
 * Respects prefers-reduced-motion: when reduced, the blobs are placed at
 * fixed positions and the animation never starts.
 */
export default function MeshGradient({
  className = "",
  colors = ["rgba(225,29,72,0.32)", "rgba(255,255,255,0.18)", "rgba(120,80,200,0.20)"],
  speed = 1,
}) {
  const a = useRef(null);
  const b = useRef(null);
  const c = useRef(null);
  const wrap = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      if (a.current) a.current.style.transform = "translate3d(-10%, -8%, 0)";
      if (b.current) b.current.style.transform = "translate3d(60%, 20%, 0)";
      if (c.current) c.current.style.transform = "translate3d(20%, 70%, 0)";
      return undefined;
    }

    let raf = 0;
    let visible = true;
    const obs = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    if (wrap.current) obs.observe(wrap.current);

    const start = performance.now();
    const tick = (now) => {
      if (!visible) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = ((now - start) / 1000) * speed;
      // Three independent Lissajous-ish drifts.
      if (a.current) {
        const x = Math.sin(t * 0.13) * 18;
        const y = Math.cos(t * 0.11) * 14;
        a.current.style.transform = `translate3d(${x - 10}%, ${y - 8}%, 0)`;
      }
      if (b.current) {
        const x = Math.cos(t * 0.09) * 22;
        const y = Math.sin(t * 0.15) * 18;
        b.current.style.transform = `translate3d(${x + 50}%, ${y + 18}%, 0)`;
      }
      if (c.current) {
        const x = Math.sin(t * 0.17 + 1.4) * 16;
        const y = Math.cos(t * 0.08 + 0.7) * 20;
        c.current.style.transform = `translate3d(${x + 18}%, ${y + 60}%, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [speed]);

  return (
    <div
      ref={wrap}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <div
        ref={a}
        className="absolute h-[70vmin] w-[70vmin] rounded-full mix-blend-screen will-change-transform"
        style={{
          background: `radial-gradient(circle at center, ${colors[0]} 0%, transparent 60%)`,
          filter: "blur(40px)",
          left: "-10%",
          top: "-10%",
        }}
      />
      <div
        ref={b}
        className="absolute h-[64vmin] w-[64vmin] rounded-full mix-blend-screen will-change-transform"
        style={{
          background: `radial-gradient(circle at center, ${colors[1]} 0%, transparent 60%)`,
          filter: "blur(50px)",
          left: "30%",
          top: "10%",
        }}
      />
      <div
        ref={c}
        className="absolute h-[80vmin] w-[80vmin] rounded-full mix-blend-screen will-change-transform"
        style={{
          background: `radial-gradient(circle at center, ${colors[2]} 0%, transparent 60%)`,
          filter: "blur(60px)",
          left: "10%",
          top: "55%",
        }}
      />
    </div>
  );
}
