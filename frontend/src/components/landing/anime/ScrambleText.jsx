import { useEffect, useRef } from "react";
import anime from "animejs";

const POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#%$&!*";

/**
 * Glitch-style scramble that locks letters in place from left to right.
 * Triggers once when scrolled into view.
 */
export default function ScrambleText({ text, className = "", duration = 1400 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.textContent = text;
      return undefined;
    }

    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started) {
            started = true;
            const obj = { progress: 0 };
            anime({
              targets: obj,
              progress: text.length,
              duration,
              easing: "linear",
              update: () => {
                const fixed = Math.floor(obj.progress);
                const out = [];
                for (let i = 0; i < text.length; i += 1) {
                  if (i < fixed) {
                    out.push(text[i]);
                  } else if (text[i] === " ") {
                    out.push(" ");
                  } else {
                    out.push(POOL[Math.floor(Math.random() * POOL.length)]);
                  }
                }
                el.textContent = out.join("");
              },
              complete: () => {
                el.textContent = text;
              },
            });
          }
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, duration]);

  return (
    <span ref={ref} className={`font-mono ${className}`}>
      {text.replace(/./g, "·")}
    </span>
  );
}
