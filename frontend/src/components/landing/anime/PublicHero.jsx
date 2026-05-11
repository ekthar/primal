import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import KineticHeadline from "./KineticHeadline";
import MeshGradient from "./MeshGradient";
import Spotlight from "./Spotlight";

/**
 * PublicHero — a cinematic header used across the public sub-pages
 * (PublicTournament, PublicAthlete, PublicAlbums). Sits on a glassy
 * surface with a drifting mesh gradient + cursor spotlight, parallax
 * title, and stagger-revealing children.
 *
 * Props:
 *   eyebrow          — small tag above the title.
 *   titleParts       — array of `{ text, italic }` parts passed to KineticHeadline.
 *   subtitle         — optional secondary line under the headline.
 *   children         — chip rail / actions rendered below the headline.
 *   accent           — color for the mesh gradient primary blob (defaults to brand red).
 *   children         — content rendered below the title.
 */
export default function PublicHero({
  eyebrow,
  titleParts = [{ text: "Primal" }],
  subtitle,
  accent = "rgba(225,29,72,0.32)",
  children,
}) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -36]);
  const titleScale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);
  const overlay = useTransform(scrollYProgress, [0, 1], [0.0, 0.35]);

  return (
    <header
      ref={ref}
      className="relative isolate overflow-hidden rounded-3xl border border-border bg-surface elev-card"
    >
      <MeshGradient
        colors={[accent, "rgba(255,255,255,0.16)", "rgba(120,80,200,0.18)"]}
        speed={0.7}
      />
      <Spotlight className="z-[1]" size={520} color="rgba(255,255,255,0.28)" />
      <motion.div
        aria-hidden
        style={{ opacity: reduced ? 0 : overlay }}
        className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-transparent via-transparent to-black/40 dark:to-black/60"
      />
      <div className="relative z-[3] p-8 sm:p-12 lg:p-14">
        {eyebrow ? (
          <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">
            {eyebrow}
          </div>
        ) : null}
        <motion.div
          className="mt-3"
          style={{
            y: reduced ? 0 : titleY,
            scale: reduced ? 1 : titleScale,
            transformOrigin: "left top",
          }}
        >
          <KineticHeadline parts={titleParts} className="text-4xl sm:text-5xl lg:text-6xl" />
        </motion.div>
        {subtitle ? (
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45, ease: [0.25, 1, 0.5, 1] }}
            className="mt-4 max-w-2xl text-base sm:text-lg text-secondary-muted"
          >
            {subtitle}
          </motion.p>
        ) : null}
        {children ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55, ease: [0.25, 1, 0.5, 1] }}
            className="mt-6"
          >
            {children}
          </motion.div>
        ) : null}
      </div>
    </header>
  );
}
