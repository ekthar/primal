import { useEffect, useRef } from "react";
import anime from "animejs";

/**
 * Anime.js powered kinetic headline. Splits each word into characters,
 * runs a staggered slide-in with skew, blur, and color flicker, then
 * settles into the final composition. Respects prefers-reduced-motion.
 */
export default function KineticHeadline({ parts, className = "" }) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const el = rootRef.current;
    if (!el) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      el.querySelectorAll(".kchar").forEach((node) => {
        node.style.opacity = "1";
        node.style.transform = "none";
        node.style.filter = "none";
      });
      return undefined;
    }

    const chars = el.querySelectorAll(".kchar");
    const tl = anime.timeline({
      easing: "cubicBezier(.25,1,.5,1)",
      autoplay: true,
    });
    tl.add({
      targets: chars,
      opacity: [0, 1],
      translateY: ["1.2em", 0],
      skewY: ["18deg", 0],
      filter: ["blur(14px)", "blur(0px)"],
      duration: 900,
      delay: anime.stagger(28, { start: 80 }),
    });
    tl.add(
      {
        targets: el.querySelectorAll(".kaccent"),
        color: ["#7A1E22", "#0A0A0A"],
        duration: 600,
        easing: "easeOutQuad",
        complete: (a) => {
          a.animatables.forEach(({ target }) => {
            target.style.color = "";
          });
        },
      },
      "-=400"
    );
    return () => tl.pause();
  }, []);

  return (
    <h1
      ref={rootRef}
      className={`font-display text-5xl sm:text-6xl lg:text-[88px] font-bold tracking-tight leading-[0.95] text-balance ${className}`}
    >
      {parts.map((p, wordIdx) => {
        if (p.br) return <br key={`br-${wordIdx}`} className="hidden sm:inline" />;
        const text = p.text || "";
        return (
          <span
            key={wordIdx}
            className={`inline-block mr-2 align-baseline ${p.italic ? "italic" : ""}`}
          >
            {Array.from(text).map((ch, i) => (
              <span
                key={i}
                className={`kchar inline-block ${p.italic ? "kaccent" : ""}`}
                style={{ opacity: 0, transform: "translateY(1.2em)" }}
              >
                {ch === " " ? "\u00A0" : ch}
              </span>
            ))}
          </span>
        );
      })}
    </h1>
  );
}
