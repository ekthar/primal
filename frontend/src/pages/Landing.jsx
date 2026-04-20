import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Shield,
  Zap,
  Timer,
  CheckCircle2,
  Users,
  UserPlus,
  FileCheck2,
  Sparkles,
  MonitorSmartphone,
} from "lucide-react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  AnimatePresence,
} from "framer-motion";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { HERO_IMAGE, TEXTURE_IMAGE } from "@/lib/mockData";
import { api } from "@/lib/api";
import frame001 from "@/assets/veo-frames/001.png";
import frame020 from "@/assets/veo-frames/020.png";
import frame050 from "@/assets/veo-frames/050.png";
import frame080 from "@/assets/veo-frames/080.png";
import frame100 from "@/assets/veo-frames/100.png";

// ---------- primitives ---------------------------------------------------------

function Reveal({ children, delay = 0, y = 24, className = "" }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.7, ease: [0.25, 1, 0.5, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SplitHeadline({ parts }) {
  const reduced = useReducedMotion();
  return (
    <h1 className="font-display text-5xl sm:text-6xl lg:text-[88px] font-bold tracking-tight leading-[0.95] text-balance">
      {parts.map((p, i) =>
        p.br ? (
          <br key={i} className="hidden sm:inline" />
        ) : (
          <motion.span
            key={i}
            initial={reduced ? false : { opacity: 0, y: 32, filter: "blur(8px)" }}
            animate={reduced ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1], delay: 0.05 + i * 0.08 }}
            className={`inline-block ${p.italic ? "italic text-primary mr-2" : "mr-2"}`}
          >
            {p.text}
          </motion.span>
        )
      )}
    </h1>
  );
}

function Marquee({ items }) {
  return (
    <div className="relative overflow-hidden py-6 border-y border-border bg-surface-muted/40">
      <motion.div
        className="flex gap-14 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 38, ease: "linear", repeat: Infinity }}
        aria-hidden
      >
        {[...items, ...items].map((item, i) => (
          <span key={i} className="text-xs sm:text-sm font-display uppercase tracking-[0.22em] text-tertiary">
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function FightTapeMarquee({ items, duration = 22 }) {
  const reduced = useReducedMotion();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface/70 backdrop-blur">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08] dark:opacity-[0.12]"
        style={{ backgroundImage: `url(${TEXTURE_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center" }}
        aria-hidden
      />
      <div className="relative">
        <motion.div
          className="flex items-center gap-2 whitespace-nowrap py-3"
          animate={reduced ? undefined : { x: ["0%", "-50%"] }}
          transition={reduced ? undefined : { duration, ease: "linear", repeat: Infinity }}
          aria-hidden
        >
          {[...items, ...items].map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 px-3 text-[11px] sm:text-xs font-display uppercase tracking-[0.22em] text-tertiary"
            >
              <span className="size-1.5 rounded-full bg-primary/70" />
              {item}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function InfiniteTileColumn({ images, duration = 18, className = "" }) {
  const reduced = useReducedMotion();
  const tiles = images.filter(Boolean);
  const loop = [...tiles, ...tiles];
  return (
    <div className={`relative overflow-hidden rounded-3xl border border-border bg-surface/40 backdrop-blur ${className}`}>
      <motion.div
        className="flex flex-col gap-3 p-3"
        animate={reduced ? undefined : { y: ["0%", "-50%"] }}
        transition={reduced ? undefined : { duration, ease: "linear", repeat: Infinity }}
        aria-hidden
      >
        {loop.map((src, i) => (
          <div
            key={i}
            className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
          >
            <img
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-[0.88] contrast-125 saturate-90"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" aria-hidden />
          </div>
        ))}
      </motion.div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" aria-hidden />
    </div>
  );
}

// ---------- sections -----------------------------------------------------------

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ease-ios ${
        scrolled ? "bg-background/70 backdrop-blur-xl border-b border-border" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2" data-testid="nav-brand">
          <div className="size-8 rounded-lg bg-foreground text-background flex items-center justify-center font-display font-bold text-sm">P</div>
          <span className="font-display font-semibold tracking-tight">Primal</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-secondary-muted">
          <a href="#paths" className="hover:text-foreground transition-colors">Who it's for</a>
          <a href="#workflow" className="hover:text-foreground transition-colors">Workflow</a>
          <a href="#admin" className="hover:text-foreground transition-colors">Admin</a>
          <a href="#stats" className="hover:text-foreground transition-colors">Numbers</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <Link to="/login"><Button variant="ghost" size="sm" data-testid="nav-login">Sign in</Button></Link>
          <Link to="/register">
            <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90 rounded-full px-4" data-testid="nav-register">
              Register
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.15]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const overlay = useTransform(scrollYProgress, [0, 1], [0.35, 0.75]);

  return (
    <section ref={ref} className="relative min-h-[92vh] overflow-hidden flex items-center pt-20">
      <motion.div
        style={{ y: reduced ? 0 : imgY, scale: reduced ? 1 : imgScale, backgroundImage: `url(${frame080})` }}
        className="absolute inset-0 -z-30 bg-cover bg-center opacity-[0.55] dark:opacity-[0.28]"
      />
      <div
        className="absolute inset-0 -z-20 opacity-[0.08] dark:opacity-[0.12] pointer-events-none"
        style={{ backgroundImage: `url(${TEXTURE_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center" }}
        aria-hidden
      />
      <motion.div
        style={{ opacity: reduced ? 0.5 : overlay }}
        className="absolute inset-0 -z-10 bg-gradient-to-b from-background/15 via-background/75 to-background"
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-10 lg:gap-12 items-center">
          <motion.div style={{ y: reduced ? 0 : textY }}>
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 backdrop-blur px-3 py-1 text-xs font-medium">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                <span>2026 season — registrations open</span>
              </div>
            </Reveal>

            <div className="mt-8">
              <SplitHeadline parts={[
                { text: "Primal" },
                { text: "Fight" },
                { text: "Series", italic: true },
                { br: true },
                { text: "Built" },
                { text: "for" },
                { text: "gyms." },
              ]} />
            </div>

            <Reveal delay={0.25}>
              <p className="mt-8 max-w-2xl text-base sm:text-xl text-secondary-muted leading-relaxed text-pretty">
                One home for MMA and martial arts events — teams, fighters, brackets, and approvals.
                Fast onboarding for gyms, clean registration for athletes, and a public-ready tournament feed.
              </p>
            </Reveal>

            <Reveal delay={0.33}>
              <div className="mt-8 max-w-2xl">
                <FightTapeMarquee
                  items={[
                    "MMA",
                    "Muay Thai",
                    "BJJ",
                    "Boxing",
                    "Kickboxing",
                    "Wrestling",
                    "Weigh-ins",
                    "Brackets",
                    "Fight cards",
                  ]}
                />
              </div>
            </Reveal>

            <Reveal delay={0.4}>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link to="/register">
                  <Button size="lg" className="bg-primary hover:bg-primary-hover text-primary-foreground h-12 px-6 rounded-full" data-testid="hero-cta-register">
                    Register to compete
                    <ArrowRight className="size-4 ml-1" />
                  </Button>
                </Link>
                <Link to="/register?track=club">
                  <Button size="lg" variant="outline" className="h-12 px-6 rounded-full bg-surface/60 backdrop-blur border-border" data-testid="hero-cta-club">
                    Register a gym <ArrowUpRight className="size-4 ml-1" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="ghost" className="h-12 px-5 rounded-full" data-testid="hero-cta-admin">
                    Staff access
                  </Button>
                </Link>
              </div>
            </Reveal>
          </motion.div>

          <Reveal delay={0.2} className="hidden lg:block">
            <div className="relative">
              <div className="grid grid-cols-2 gap-4">
                <InfiniteTileColumn
                  images={[frame050, frame020, frame080, frame001, frame100]}
                  duration={20}
                  className="h-[520px]"
                />
                <InfiniteTileColumn
                  images={[frame080, frame100, frame001, frame020, frame050]}
                  duration={24}
                  className="h-[520px] translate-y-8"
                />
              </div>
              <div className="pointer-events-none absolute -inset-8 bg-primary/10 blur-3xl -z-10 rounded-full" aria-hidden />
            </div>
          </Reveal>
        </div>
      </div>

      {/* floating status chip rail */}
      <Reveal delay={0.6} className="absolute bottom-10 inset-x-0 flex justify-center">
        <div className="glass rounded-full px-2 py-2 flex items-center gap-1.5 shadow-soft">
          {[
            ["draft", "Draft"],
            ["submitted", "Submitted"],
            ["under_review", "Under Review"],
            ["needs_correction", "Needs Correction"],
            ["approved", "Approved"],
          ].map(([k, label], i) => (
            <motion.span
              key={k}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + i * 0.08, duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
              viewport={{ once: true }}
              className={`pill pill-${k}`}
            >
              {label}
            </motion.span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Announcements() {
  const reduced = useReducedMotion();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | live | fallback

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await api.publicCirculars({ limit: 8 });
      if (cancelled) return;
      if (error || !data?.circulars) {
        setStatus("fallback");
        setItems([
          { id: "demo-1", kind: "registration", title: "Registration is open", subtitle: "Athletes & gyms", body: "Create your profile, pick your division, and lock your entry. Early entries get priority seeding.", pinned: true, publishedAt: new Date().toISOString(), coverImageUrl: frame080, ctaLabel: "Register", ctaUrl: "/register" },
          { id: "demo-2", kind: "window", title: "Editing window closes in 48 hours", subtitle: "Weight class · documents", body: "Update weight class, documents, and discipline before the lock to avoid delays at check-in.", pinned: false, publishedAt: new Date().toISOString(), coverImageUrl: frame020 },
          { id: "demo-3", kind: "notice", title: "Gym roster verification", subtitle: "Managers only", body: "Add fighters to your gym roster and verify identity once — reuse across events.", pinned: false, publishedAt: new Date().toISOString(), coverImageUrl: frame001 },
          { id: "demo-4", kind: "rules", title: "Ruleset & weigh-in circular published", subtitle: "Read before check-in", body: "Unified check-in flow across MMA, striking, and grappling divisions. Bring photo ID and medical clearance.", pinned: false, publishedAt: new Date().toISOString(), coverImageUrl: frame100 },
        ]);
        return;
      }
      setStatus("live");
      setItems(data.circulars);
    })();
    return () => { cancelled = true; };
  }, []);

  const kindMeta = {
    registration: { tag: "Registration", icon: Zap, accent: "from-primary/25" },
    window: { tag: "Editing window", icon: Timer, accent: "from-amber-500/20" },
    rules: { tag: "Rules", icon: Shield, accent: "from-sky-500/20" },
    notice: { tag: "Circular", icon: FileCheck2, accent: "from-emerald-500/15" },
  };

  const fmt = (d) => {
    if (!d) return null;
    try {
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(new Date(d));
    } catch {
      return null;
    }
  };

  return (
    <section id="updates" className="py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">Public updates</div>
              <h2 className="font-display mt-3 text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-balance max-w-3xl">
                Official circulars and announcements.
              </h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 backdrop-blur px-3 py-1 text-xs font-medium">
              <span className={`size-1.5 rounded-full ${status === "live" ? "bg-emerald-500" : "bg-primary"} ${status === "loading" ? "animate-pulse" : ""}`} />
              <span>{status === "live" ? "Live from admin desk" : status === "loading" ? "Loading…" : "Demo data (API offline)"}</span>
            </div>
          </div>
        </Reveal>

        <div className="mt-10 grid md:grid-cols-2 gap-5">
          {items.map((u, i) => {
            const meta = kindMeta[u.kind] || kindMeta.notice;
            const Icon = meta.icon;
            const date = fmt(u.publishedAt || u.createdAt);
            const cover = u.coverImageUrl || frame080;
            return (
            <Reveal key={u.id || i} delay={i * 0.07}>
              <motion.article
                initial={reduced ? false : { opacity: 0, y: 10 }}
                whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
                className="group relative rounded-3xl border border-border bg-surface overflow-hidden elev-card"
              >
                {/* pamphlet cover */}
                <div className="relative h-32 sm:h-36">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${cover})` }}
                    aria-hidden
                  />
                  <div className={`absolute inset-0 bg-gradient-to-b ${meta.accent} via-background/40 to-background`} aria-hidden />
                  <div
                    className="absolute inset-0 opacity-[0.12] mix-blend-overlay pointer-events-none"
                    style={{ backgroundImage: `url(${TEXTURE_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center" }}
                    aria-hidden
                  />
                  <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent" aria-hidden />
                </div>

                <div className="p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="size-11 rounded-2xl bg-surface-muted border border-border flex items-center justify-center">
                        <Icon className="size-5" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{meta.tag}</div>
                          {u.pinned ? (
                            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-primary">Pinned</span>
                          ) : null}
                        </div>
                        <div className="font-display text-xl sm:text-2xl font-semibold tracking-tight mt-1 truncate">{u.title}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium border border-border bg-surface-muted/60 text-secondary-muted">
                        <span className="size-1.5 rounded-full bg-emerald-500/80" />
                        Public
                      </div>
                      {date ? <div className="mt-2 text-[11px] text-tertiary font-mono">{date}</div> : null}
                    </div>
                  </div>

                  {u.subtitle ? (
                    <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-tertiary font-semibold">
                      {u.subtitle}
                    </div>
                  ) : null}

                  <p className="mt-3 text-sm sm:text-base text-secondary-muted leading-relaxed max-w-[60ch]">
                    {u.body}
                  </p>

                  {u.ctaLabel && u.ctaUrl ? (
                    <div className="mt-6">
                      <Link to={u.ctaUrl}>
                        <Button variant="outline" className="rounded-full bg-surface/70 backdrop-blur border-border">
                          {u.ctaLabel} <ArrowUpRight className="size-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  ) : null}
                </div>

                <div
                  className="absolute -bottom-24 -right-24 size-72 rounded-full bg-primary/8 blur-3xl opacity-70 group-hover:opacity-100 transition-opacity duration-500"
                  aria-hidden
                />
              </motion.article>
            </Reveal>
          );
          })}
        </div>
      </div>
    </section>
  );
}

function Paths() {
  const paths = [
    {
      tag: "Club path",
      title: "One dashboard. Your entire roster.",
      body: "Register your club, add fighters, track their medicals, handle correction requests — all in one place. Your data, your control.",
      icon: Users,
      testid: "path-club",
      to: "/register?track=club",
      cta: "Onboard your club",
    },
    {
      tag: "Individual path",
      title: "No club? No problem.",
      body: "Independent fighters register directly. Upload your medical, choose your division, and track your status in real time.",
      icon: UserPlus,
      testid: "path-individual",
      to: "/register",
      cta: "Apply as a fighter",
    },
  ];
  return (
    <section id="paths" className="py-28 sm:py-36 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">Two ways in</div>
          <h2 className="font-display mt-3 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-balance max-w-3xl">
            Self-serve registration — by clubs or by fighters.
          </h2>
        </Reveal>

        <div className="mt-14 grid md:grid-cols-2 gap-5">
          {paths.map((p, i) => (
            <Reveal key={p.testid} delay={i * 0.1}>
              <Link
                to={p.to}
                data-testid={p.testid}
                className="group block h-full rounded-3xl border border-border bg-surface p-8 relative overflow-hidden hover:-translate-y-1 transition-all duration-500 ease-ios elev-card"
              >
                <div className="flex items-start justify-between">
                  <div className="size-12 rounded-xl bg-surface-muted flex items-center justify-center border border-border">
                    <p.icon className="size-5" strokeWidth={1.75} />
                  </div>
                  <ArrowUpRight className="size-5 text-tertiary group-hover:text-foreground group-hover:-translate-y-1 group-hover:translate-x-1 transition-all duration-300" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold mt-10">{p.tag}</div>
                <h3 className="font-display mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-4 text-sm sm:text-base text-secondary-muted leading-relaxed">{p.body}</p>
                <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium">
                  {p.cta}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </div>
                <div
                  className="absolute -bottom-20 -right-20 size-64 rounded-full bg-primary/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  aria-hidden
                />
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowScrollytell() {
  const steps = [
    { k: "submitted", t: "Applicant submits", d: "Reusable profile, correct documents, single source of truth.", icon: FileCheck2 },
    { k: "under_review", t: "Reviewer picks it up", d: "Auto-assigned by load; SLA timer starts instantly.", icon: Timer },
    { k: "needs_correction", t: "Correction — if needed", d: "One click roundtrips specific fields to the applicant.", icon: Sparkles },
    { k: "approved", t: "Approved", d: "Public bracket updates. Applicant gets notified on email + WhatsApp.", icon: CheckCircle2 },
  ];
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const line = useTransform(scrollYProgress, [0.15, 0.75], ["0%", "100%"]);

  return (
    <section id="workflow" ref={ref} className="py-28 sm:py-36 bg-surface-muted/40 border-y border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">The workflow</div>
          <h2 className="font-display mt-3 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-balance max-w-3xl">
            Transparent from submit to weigh-in.
          </h2>
          <p className="mt-5 text-base text-secondary-muted max-w-2xl leading-relaxed">
            Every application has a timeline, an SLA, and an actor on record. Applicants see
            exactly where they stand. Reviewers work a clean queue.
          </p>
        </Reveal>

        <div className="mt-20 relative">
          {/* vertical progress line */}
          <div className="absolute left-5 md:left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2" aria-hidden />
          <motion.div
            style={{ height: line }}
            className="absolute left-5 md:left-1/2 top-0 w-px bg-foreground -translate-x-1/2"
            aria-hidden
          />

          <ol className="space-y-16 md:space-y-24">
            {steps.map((s, i) => (
              <li key={s.k} className="relative md:grid md:grid-cols-2 md:gap-14 items-center">
                <Reveal className={i % 2 === 0 ? "md:text-right md:pr-10" : "md:order-2 md:pl-10"}>
                  <div className="pl-14 md:pl-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Step {i + 1}</div>
                    <h3 className="font-display mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">{s.t}</h3>
                    <p className="mt-3 text-sm sm:text-base text-secondary-muted max-w-md leading-relaxed">{s.d}</p>
                    <div className={`mt-4 ${i % 2 === 0 ? "md:justify-end md:flex" : ""}`}>
                      <span className={`pill pill-${s.k}`}>{s.t}</span>
                    </div>
                  </div>
                </Reveal>
                <div className={`hidden md:block ${i % 2 === 0 ? "md:order-2 md:pl-10" : "md:pr-10"}`}>
                  <Reveal delay={0.1}>
                    <div className="rounded-2xl border border-border bg-surface p-6 elev-card">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg bg-surface-muted flex items-center justify-center">
                          <s.icon className="size-5" strokeWidth={1.75} />
                        </div>
                        <div>
                          <div className="text-xs font-mono text-tertiary">AT+0{i}:{10 + i * 2}</div>
                          <div className="text-sm font-medium">{s.t}</div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-tertiary">
                        <span className="size-1.5 rounded-full bg-emerald-500" /> Live timeline
                      </div>
                    </div>
                  </Reveal>
                </div>
                <span className="absolute left-5 md:left-1/2 top-2 size-3 rounded-full bg-foreground -translate-x-1/2 ring-4 ring-background" aria-hidden />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function AdminShowcase() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const rotate = useTransform(scrollYProgress, [0, 1], [6, -6]);
  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const reduced = useReducedMotion();

  return (
    <section id="admin" ref={ref} className="py-28 sm:py-36 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-14 items-center">
        <Reveal>
          <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">Built for admins</div>
          <h2 className="font-display mt-3 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-balance">
            200 applicants, <em className="not-italic italic text-primary">one afternoon</em>.
          </h2>
          <ul className="mt-8 space-y-3.5 text-sm sm:text-base">
            {[
              ["Keyboard-first queue with bulk approve."],
              ["Auto-flag expired medicals, weight mismatches, age limits."],
              ["Correction loop — send a field back, not the whole form."],
              ["Tamper-evident audit log — exportable as Excel."],
              ["SLA counters per reviewer, per tournament."],
            ].map(([t], i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <Link to="/login" className="mt-10 inline-flex">
            <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90 rounded-full px-6 h-12" data-testid="admin-cta">
              Open the admin preview <ArrowRight className="size-4 ml-1" />
            </Button>
          </Link>
        </Reveal>

        <motion.div
          style={{ rotate: reduced ? 0 : rotate, y: reduced ? 0 : y }}
          className="relative"
        >
          <div className="relative rounded-3xl border border-border bg-surface elev-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2 bg-surface-muted/50">
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 text-[11px] font-mono text-tertiary">tournamentos / queue</span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { n: "Aiko Tanaka", s: "under_review", c: "Sakura Gym", w: "Featherweight" },
                { n: "Diego Ruiz", s: "needs_correction", c: "Legion MMA", w: "Welterweight" },
                { n: "Marcus Okafor", s: "approved", c: "Apex Combat Club", w: "Heavyweight" },
                { n: "Lena Ivanova", s: "submitted", c: "Titan Fight Academy", w: "Bantamweight" },
                { n: "Kofi Okafor", s: "under_review", c: "Legion MMA", w: "Lightweight" },
                { n: "Priya Patel", s: "approved", c: "Sakura Gym", w: "Flyweight" },
              ].map((r, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface hover:bg-surface-muted border border-transparent hover:border-border transition-all duration-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-full bg-surface-muted border border-border flex items-center justify-center text-[11px] font-semibold">
                      {r.n.split(" ").map((x) => x[0]).join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.n}</div>
                      <div className="text-[11px] text-tertiary truncate">{r.c} · {r.w}</div>
                    </div>
                  </div>
                  <span className={`pill pill-${r.s}`}>{r.s.replace("_", " ")}</span>
                </motion.div>
              ))}
            </div>
          </div>
          <div className="absolute -top-8 -right-8 size-48 rounded-full bg-primary/10 blur-3xl -z-10" aria-hidden />
        </motion.div>
      </div>
    </section>
  );
}

function Stats() {
  const items = [
    { n: "71%", l: "Approval rate" },
    { n: "6.2h", l: "Avg review time" },
    { n: "18%", l: "Correction rate" },
    { n: "428", l: "Applicants this season" },
  ];
  return (
    <section id="stats" className="py-24 border-y border-border bg-surface-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4 gap-10">
        {items.map((s, i) => (
          <Reveal key={s.l} delay={i * 0.08}>
            <div className="flex flex-col gap-2">
              <div className="font-display text-5xl sm:text-6xl font-semibold tracking-tight tabular-nums">{s.n}</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-tertiary font-semibold">{s.l}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section className="py-28 sm:py-36">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative rounded-3xl border border-border bg-surface overflow-hidden p-10 sm:p-14 elev-card grain">
            <div
              className="absolute inset-0 opacity-[0.06] dark:opacity-[0.08] pointer-events-none"
              style={{ backgroundImage: `url(${TEXTURE_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center" }}
            />
            <div className="relative">
              <div className="font-display text-primary text-6xl leading-none">"</div>
              <p className="font-display text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight leading-snug text-balance mt-4">
                We cut review times from four days to four hours. Our reviewers look forward to the queue now.
              </p>
              <div className="mt-8 flex items-center gap-4">
                <div className="size-12 rounded-full bg-foreground text-background flex items-center justify-center font-display font-bold">KI</div>
                <div>
                  <div className="font-medium">Kenji Ito</div>
                  <div className="text-xs text-tertiary">Chief Sanctioning Officer · All-Japan Combat League</div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-28 sm:py-36">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative rounded-3xl bg-foreground text-background overflow-hidden p-10 sm:p-16">
            <div
              className="absolute inset-0 opacity-[0.08]"
              style={{ backgroundImage: `url(${HERO_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center" }}
            />
            <div className="relative">
              <div className="text-[10px] uppercase tracking-[0.22em] text-background/60 font-semibold">Start this season</div>
              <h2 className="font-display mt-3 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-balance">
                Your fighters are ready. Your platform should be too.
              </h2>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link to="/register">
                  <Button size="lg" className="bg-primary hover:bg-primary-hover text-primary-foreground h-12 px-6 rounded-full" data-testid="cta-apply">
                    Apply Now <ArrowRight className="size-4 ml-1" />
                  </Button>
                </Link>
                <Link to="/register?track=club">
                  <Button size="lg" variant="outline" className="h-12 px-6 rounded-full bg-transparent border-background/30 text-background hover:bg-background/10 hover:text-background" data-testid="cta-club">
                    Club Onboarding
                  </Button>
                </Link>
                <Link to="/login">
                  <Button size="lg" variant="ghost" className="h-12 px-5 rounded-full text-background hover:bg-background/10 hover:text-background" data-testid="cta-admin">
                    Admin Access <ArrowUpRight className="size-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid sm:grid-cols-3 gap-8 text-sm text-tertiary">
        <div>
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-foreground text-background flex items-center justify-center font-display font-bold text-xs">T</div>
            <span className="font-display font-semibold tracking-tight text-foreground">TournamentOS</span>
          </div>
          <p className="mt-3 leading-relaxed">Built for sanctioning bodies, federations, and promoters.</p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="font-semibold text-foreground text-xs uppercase tracking-wider">Product</div>
          <a href="#paths">Registration</a>
          <a href="#workflow">Review workflow</a>
          <a href="#admin">Admin</a>
        </div>
        <div className="flex flex-col gap-2">
          <div className="font-semibold text-foreground text-xs uppercase tracking-wider">Access</div>
          <Link to="/login">Sign in</Link>
          <Link to="/register">Register</Link>
          <Link to="/register?track=club">Club onboarding</Link>
        </div>
      </div>
      <div className="mt-10 text-center text-[11px] text-tertiary flex items-center justify-center gap-2">
        <MonitorSmartphone className="size-3.5" /> Web now · Mobile on the way
      </div>
    </footer>
  );
}

// ---------- page ---------------------------------------------------------------

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Announcements />
      <Marquee items={[
        "Primal · Fight Series",
        "Registration · Open",
        "Gym onboarding · Fast",
        "Medical checks · Streamlined",
        "Brackets · Live",
        "Teams · Verified",
        "Athletes · Ready",
      ]} />
      <Paths />
      <WorkflowScrollytell />
      <AdminShowcase />
      <Stats />
      <Testimonial />
      <CTA />
      <Footer />
    </div>
  );
}
