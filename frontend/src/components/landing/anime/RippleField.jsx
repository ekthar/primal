import { useEffect, useRef } from "react";
import anime from "animejs";

/**
 * Subtle animated dot field that ripples on mount and reacts to pointer
 * proximity. Lightweight: 12 columns x 7 rows of div nodes (no canvas).
 */
export default function RippleField({ className = "", cols = 12, rows = 7 }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dots = root.querySelectorAll(".rdot");
    if (reduced) {
      dots.forEach((d) => {
        d.style.opacity = "0.18";
      });
      return undefined;
    }

    anime({
      targets: dots,
      opacity: [0, 0.22],
      scale: [0, 1],
      duration: 1200,
      delay: anime.stagger(20, { grid: [cols, rows], from: "center" }),
      easing: "easeOutQuad",
    });

    const onMove = (event) => {
      const rect = root.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      dots.forEach((d) => {
        const cx = parseFloat(d.dataset.cx);
        const cy = parseFloat(d.dataset.cy);
        const dx = cx - px;
        const dy = cy - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const intensity = Math.max(0, 0.32 - dist) / 0.32;
        d.style.transform = `scale(${1 + intensity * 1.6})`;
        d.style.opacity = String(0.16 + intensity * 0.45);
      });
    };
    const onLeave = () => {
      anime({
        targets: dots,
        scale: 1,
        opacity: 0.22,
        duration: 600,
        easing: "easeOutQuad",
      });
    };
    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    return () => {
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
    };
  }, [cols, rows]);

  const cells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      cells.push({ x, y, cx: x / (cols - 1), cy: y / (rows - 1) });
    }
  }

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={`pointer-events-auto absolute inset-0 grid place-items-center ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {cells.map((c) => (
        <span
          key={`${c.x}-${c.y}`}
          className="rdot block rounded-full bg-primary/60 will-change-transform"
          data-cx={c.cx}
          data-cy={c.cy}
          style={{ width: 4, height: 4, opacity: 0 }}
        />
      ))}
    </div>
  );
}
