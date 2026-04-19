import { Link } from "react-router-dom";
import { ArrowRight, Shield, Zap, Timer, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { HERO_IMAGE } from "@/lib/mockData";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-foreground text-background flex items-center justify-center font-display font-bold text-sm">T</div>
            <span className="font-display font-semibold tracking-tight">TournamentOS</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-secondary-muted">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#workflow" className="hover:text-foreground transition-colors">Workflow</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Link to="/login">
              <Button variant="ghost" size="sm" data-testid="nav-login">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90" data-testid="nav-register">
                Register
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-28 pb-24 overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-[0.28] dark:opacity-[0.18]"
          style={{
            backgroundImage: `url(${HERO_IMAGE})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/10 via-background/70 to-background" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 backdrop-blur px-3 py-1 text-xs font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Season 2026 · Registration open</span>
          </div>
          <h1 className="font-display mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[0.95] text-balance">
            The operating system <br className="hidden sm:inline" />
            for <em className="not-italic italic text-primary">fight</em> sanctioning.
          </h1>
          <p className="mt-6 max-w-2xl text-base sm:text-lg text-secondary-muted leading-relaxed text-pretty">
            A premium registration &amp; review platform built for MMA, kickboxing and grappling federations.
            Submit fighters, clear medicals, and sanction bouts — without the paperwork.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/register">
              <Button size="lg" className="bg-primary hover:bg-primary-hover text-primary-foreground h-11 px-6" data-testid="hero-cta-register">
                Register a fighter
                <ArrowRight className="size-4 ml-1" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="h-11 px-6 border-border bg-surface/60 backdrop-blur" data-testid="hero-cta-admin">
                Admin sign in
              </Button>
            </Link>
          </div>

          {/* Status chip reel */}
          <div className="mt-14 flex flex-wrap gap-2">
            <span className="pill pill-draft">Draft</span>
            <span className="pill pill-submitted">Submitted</span>
            <span className="pill pill-under_review">Under Review</span>
            <span className="pill pill-needs_correction">Needs Correction</span>
            <span className="pill pill-approved">Approved</span>
            <span className="pill pill-rejected">Rejected</span>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: Zap, title: "Fast admin scanning", body: "Dense, keyboard-first queue with bulk approve, filters, and sticky context." },
            { icon: Shield, title: "Medical & weight checks", body: "Automatic flags for expired medicals, weight-class mismatch, and age limits." },
            { icon: Timer, title: "Correction windows", body: "Roundtrip a specific field back to the club without rejecting the whole submission." },
          ].map((f, i) => (
            <div key={i} className="elev-card rounded-2xl border border-border bg-surface p-6 hover:-translate-y-0.5 transition-all duration-300 ease-ios">
              <div className="size-10 rounded-lg bg-surface-muted flex items-center justify-center">
                <f.icon className="size-5" strokeWidth={1.75} />
              </div>
              <h3 className="font-display mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm text-secondary-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>

        {/* Workflow preview */}
        <div id="workflow" className="mt-24 rounded-3xl border border-border bg-surface overflow-hidden elev-card">
          <div className="grid md:grid-cols-2">
            <div className="p-8 sm:p-12">
              <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Review queue</div>
              <h2 className="font-display mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
                Built for reviewers who see 200 applicants a day.
              </h2>
              <p className="mt-4 text-secondary-muted leading-relaxed">
                Split-pane workbench. Keyboard shortcuts. Real-time timeline. Single-click requests for
                correction — the applicant sees exactly which field to fix.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {["Bulk approve low-risk applicants", "Auto-flag medical expirations", "Inline appeals & audit trail"].map((t, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative bg-surface-muted border-l border-border p-6 sm:p-8 min-h-[420px]">
              <div className="absolute inset-6 sm:inset-8 rounded-xl border border-border bg-surface p-4 overflow-hidden elev-card">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-red-400" />
                    <span className="size-2.5 rounded-full bg-amber-400" />
                    <span className="size-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-[11px] font-mono text-tertiary">queue / season-2026</span>
                </div>
                <div className="mt-3 space-y-2">
                  {[
                    { n: "Aiko Tanaka", s: "under_review", c: "Sakura Gym" },
                    { n: "Diego Ruiz", s: "needs_correction", c: "Legion MMA" },
                    { n: "Marcus Okafor", s: "approved", c: "Apex Combat" },
                    { n: "Lena Ivanova", s: "submitted", c: "Titan" },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-muted transition-colors">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.n}</div>
                        <div className="text-[11px] text-tertiary truncate">{r.c}</div>
                      </div>
                      <span className={`pill pill-${r.s}`}>{r.s.replace("_", " ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-xs text-tertiary">
        TournamentOS · Built for sanctioning bodies, federations, and promoters.
      </footer>
    </div>
  );
}
