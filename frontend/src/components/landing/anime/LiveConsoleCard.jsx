import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CalendarRange, Radio, Trophy, ArrowUpRight } from "lucide-react";

/**
 * LiveConsoleCard — a glassy panel that auto-rotates between three
 * "console" views. Designed to fill the right column of the hero on lg+.
 *
 * Each card:
 *   1. Registration window — pulse dot + dates + CTA chip.
 *   2. Live brackets — a tiny SVG bracket that animates its connector
 *      lines drawing in.
 *   3. Latest result — winner pill + method + round.
 *
 * Cards rotate every `rotateMs` (default 4500). Hovering the card pauses
 * the rotation. Respects prefers-reduced-motion (still rotates but with
 * fade-only transitions).
 */
export default function LiveConsoleCard({
  registration,
  liveCount,
  latestResult,
  rotateMs = 4500,
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (paused) return undefined;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % 3), rotateMs);
    return () => window.clearInterval(id);
  }, [paused, rotateMs]);

  const cards = [
    <RegistrationCard key="reg" registration={registration} />,
    <BracketCard key="bracket" liveCount={liveCount} />,
    <ResultCard key="result" latestResult={latestResult} />,
  ];

  return (
    <div
      className="relative h-[420px] w-full overflow-hidden rounded-3xl border border-white/15 bg-black/30 backdrop-blur-xl shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onTouchCancel={() => setPaused(false)}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(120% 80% at 100% 0%, rgba(225,29,72,0.22) 0%, transparent 55%), radial-gradient(120% 80% at 0% 100%, rgba(120,80,200,0.22) 0%, transparent 55%)",
        }}
        aria-hidden
      />
      <div className="relative z-[1] flex h-full flex-col p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/60">
            <span className="flex size-1.5 items-center justify-center">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </span>
            Live console
          </div>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show card ${i + 1}`}
                className={`size-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-white" : "bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, filter: "blur(8px)" }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -16, filter: "blur(8px)" }}
              transition={{ duration: 0.55, ease: [0.25, 1, 0.5, 1] }}
              className="absolute inset-0"
            >
              {cards[index]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function RegistrationCard({ registration }) {
  const open = registration?.open;
  const dates = registration?.dates || "Window TBA";
  const next = registration?.tournament || "Next event";
  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70">
        <CalendarRange className="size-3.5" /> Registration
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-wider">
        <span className={`size-2 rounded-full ${open ? "bg-emerald-400 animate-pulse" : "bg-white/40"}`} />
        <span className={open ? "text-emerald-300" : "text-white/60"}>
          {open ? "Window open" : "Opening soon"}
        </span>
      </div>
      <div className="mt-4 font-display text-3xl sm:text-4xl font-semibold leading-tight">{next}</div>
      <div className="mt-2 text-sm text-white/75">{dates}</div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wider text-white/60">
          Athletes &amp; gyms welcome
        </div>
        <a
          href="/register"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/20"
        >
          Register <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

function BracketCard({ liveCount }) {
  const reduced = useReducedMotion();
  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70">
        <Radio className="size-3.5" /> Live brackets
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="font-display text-5xl sm:text-6xl font-bold tabular-nums">
          {Math.max(0, Math.round(Number(liveCount) || 0))}
        </div>
        <div className="text-sm text-white/60">running now</div>
      </div>
      <svg viewBox="0 0 240 120" className="mt-4 w-full" aria-hidden>
        {/* connector lines that draw in */}
        {[
          // round 1
          { d: "M10 18 H80", delay: 0 },
          { d: "M10 50 H80", delay: 0.05 },
          { d: "M10 80 H80", delay: 0.1 },
          { d: "M10 110 H80", delay: 0.15 },
          // r1 -> r2
          { d: "M80 18 V34 H120", delay: 0.25 },
          { d: "M80 50 V34", delay: 0.3 },
          { d: "M80 80 V96 H120", delay: 0.35 },
          { d: "M80 110 V96", delay: 0.4 },
          // r2 -> final
          { d: "M120 34 H160 V64 H200", delay: 0.55 },
          { d: "M120 96 H160 V64", delay: 0.6 },
          // final
          { d: "M200 64 H230", delay: 0.75 },
        ].map((line, i) => (
          <motion.path
            key={i}
            d={line.d}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1.4"
            fill="none"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={reduced ? undefined : { pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: line.delay, ease: [0.25, 1, 0.5, 1] }}
          />
        ))}
        {/* node dots */}
        {[
          [10, 18], [10, 50], [10, 80], [10, 110],
          [120, 34], [120, 96],
          [230, 64],
        ].map(([cx, cy], i) => (
          <motion.circle
            key={`n${i}`}
            cx={cx}
            cy={cy}
            r={i === 6 ? 4 : 2.5}
            fill={i === 6 ? "#f43f5e" : "rgba(255,255,255,0.85)"}
            initial={reduced ? false : { scale: 0 }}
            animate={reduced ? undefined : { scale: 1 }}
            transition={{ duration: 0.4, delay: 0.85 + i * 0.04, type: "spring", stiffness: 220 }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
        ))}
      </svg>
      <div className="mt-auto text-[11px] uppercase tracking-wider text-white/60">
        Single-elimination · auto-seeded
      </div>
    </div>
  );
}

function ResultCard({ latestResult }) {
  const winner = latestResult?.winner || "TBA";
  const opponent = latestResult?.opponent || "TBA";
  const method = latestResult?.method || "DEC";
  const round = latestResult?.round ?? "—";
  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70">
        <Trophy className="size-3.5" /> Latest result
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-emerald-300">Winner</div>
          <div className="mt-0.5 font-display text-xl sm:text-2xl font-semibold leading-tight">
            {winner}
          </div>
        </div>
        <div className="font-display text-2xl text-white/40">vs</div>
        <div className="text-left">
          <div className="text-[11px] uppercase tracking-wider text-white/50">Opponent</div>
          <div className="mt-0.5 font-display text-xl sm:text-2xl font-semibold leading-tight text-white/80">
            {opponent}
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-wider">
          {method}
        </span>
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-wider">
          R{round}
        </span>
      </div>
      <div className="mt-auto text-[11px] uppercase tracking-wider text-white/60">
        Result confirmed · scorecard archived
      </div>
    </div>
  );
}
