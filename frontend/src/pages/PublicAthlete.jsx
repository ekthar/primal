import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Trophy, Award, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { ResponsivePageShell, PageSectionHeader } from "@/components/shared/ResponsivePrimitives";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { useLocale } from "@/context/LocaleContext";
import PublicHero from "@/components/landing/anime/PublicHero";
import CountUp from "@/components/landing/anime/CountUp";
import ScrambleText from "@/components/landing/anime/ScrambleText";

function ageFromDob(dob) {
  if (!dob) return null;
  try {
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return null;
    const ms = Date.now() - d.getTime();
    const years = ms / (1000 * 60 * 60 * 24 * 365.25);
    return Math.floor(years);
  } catch {
    return null;
  }
}

function StatRing({ value, total, label, accent = "rgb(225 29 72)", delay = 0 }) {
  const reduced = useReducedMotion();
  // Treat the largest of (value, total) as 100% so a single big number still
  // produces a full ring; if total is 0, fall back to a soft outer ring.
  const denom = Math.max(total, value, 1);
  const pct = denom > 0 ? Math.min(1, value / denom) : 0;
  const circumference = 2 * Math.PI * 44;
  const dash = circumference * pct;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative size-[120px]">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-border"
          />
          <motion.circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke={accent}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={reduced ? false : { strokeDashoffset: circumference }}
            whileInView={reduced ? undefined : { strokeDashoffset: circumference - dash }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 1.2, delay, ease: [0.16, 1, 0.3, 1] }}
            style={{ strokeDashoffset: reduced ? circumference - dash : undefined }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="font-display text-3xl sm:text-4xl font-semibold tabular-nums">
            <CountUp to={value} duration={1200} />
          </div>
        </div>
      </div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-tertiary font-semibold">{label}</div>
    </div>
  );
}

export default function PublicAthlete() {
  const locale = useLocale();
  const router = useRouter();
  const { id } = router.query;
  const reduced = useReducedMotion();
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await api.publicAthlete(id);
      if (cancel) return;
      if (error || !data?.athlete) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setAthlete(data.athlete);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [id]);

  if (loading) {
    return <ResponsivePageShell><SectionLoader /></ResponsivePageShell>;
  }
  if (notFound || !athlete) {
    return (
      <ResponsivePageShell className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> {locale?.t("publicAthlete.backHome", "Back to home") ?? "Back to home"}
        </Link>
        <PageSectionHeader
          eyebrow={locale?.t("publicAthlete.eyebrow", "Athlete") ?? "Athlete"}
          title={locale?.t("publicAthlete.notFoundTitle", "Athlete not found") ?? "Athlete not found"}
          description={locale?.t("publicAthlete.notFoundDescription", "This athlete record is not public or no longer exists.") ?? "This athlete record is not public or no longer exists."}
        />
      </ResponsivePageShell>
    );
  }

  const fullName = `${athlete.first_name || ""} ${athlete.last_name || ""}`.trim() || "—";
  const titleParts = fullName.split(/\s+/).filter(Boolean).map((token, i, arr) => ({
    text: token,
    italic: i === arr.length - 1 && arr.length > 1,
  }));
  const age = ageFromDob(athlete.date_of_birth);
  const wins = Number(athlete.record_wins || 0);
  const losses = Number(athlete.record_losses || 0);
  const draws = Number(athlete.record_draws || 0);
  const total = wins + losses + draws;
  const fighterCode = athlete.fighter_code || athlete.code || athlete.id?.slice?.(0, 8)?.toUpperCase?.();

  return (
    <ResponsivePageShell className="space-y-10">
      <Link
        href={athlete.tournament_slug ? `/tournaments/${athlete.tournament_slug}` : "/"}
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        {athlete.tournament_slug
          ? `${locale?.t("publicAthlete.backToTournament", "Back to") ?? "Back to"} ${athlete.tournament_name || ""}`
          : locale?.t("publicAthlete.backHome", "Back to home") ?? "Back to home"}
      </Link>

      <PublicHero
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Trophy className="size-3.5" />
            {athlete.tournament_name || locale?.t("publicAthlete.eyebrow", "Athlete") || "Athlete"}
          </span>
        }
        titleParts={titleParts}
        accent="rgba(120,80,200,0.32)"
      >
        {fighterCode ? (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 backdrop-blur px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-tertiary">
            <span className="size-1.5 rounded-full bg-primary" />
            <ScrambleText text={`FIGHTER · ${fighterCode}`} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 text-sm text-secondary-muted">
          {athlete.discipline ? (
            <span className="rounded-full border border-border bg-surface-muted px-3 py-1">{athlete.discipline}</span>
          ) : null}
          {athlete.weight_class ? (
            <span className="rounded-full border border-border bg-surface-muted px-3 py-1">{athlete.weight_class}</span>
          ) : null}
          {athlete.weight_kg ? (
            <span className="rounded-full border border-border bg-surface-muted px-3 py-1">
              {athlete.weight_kg} {locale?.t("publicAthlete.kg", "kg") ?? "kg"}
            </span>
          ) : null}
          {age !== null ? (
            <span className="rounded-full border border-border bg-surface-muted px-3 py-1">
              {age} {locale?.t("publicAthlete.years", "yrs") ?? "yrs"}
            </span>
          ) : null}
          {athlete.gender ? (
            <span className="rounded-full border border-border bg-surface-muted px-3 py-1">{athlete.gender}</span>
          ) : null}
          {athlete.club_name ? (
            <span className="rounded-full border border-border bg-surface-muted px-3 py-1">{athlete.club_name}</span>
          ) : null}
        </div>
      </PublicHero>

      <section className="rounded-3xl border border-border bg-surface p-8 sm:p-10 elev-card">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">
          <Activity className="size-3.5" />
          {locale?.t("publicAthlete.recordEyebrow", "Career record") ?? "Career record"}
        </div>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10 place-items-center">
          <StatRing
            value={wins}
            total={total}
            label={locale?.t("publicAthlete.wins", "Wins") ?? "Wins"}
            accent="rgb(16 185 129)"
            delay={0.1}
          />
          <StatRing
            value={losses}
            total={total}
            label={locale?.t("publicAthlete.losses", "Losses") ?? "Losses"}
            accent="rgb(225 29 72)"
            delay={0.25}
          />
          <StatRing
            value={draws}
            total={total}
            label={locale?.t("publicAthlete.draws", "Draws") ?? "Draws"}
            accent="rgb(217 119 6)"
            delay={0.4}
          />
        </div>
        {total > 0 ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 8 }}
            whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-8 flex items-center justify-center gap-2 text-sm text-secondary-muted"
          >
            <Award className="size-4 text-primary" />
            <span className="tabular-nums">{total}</span>
            <span>{locale?.t("publicAthlete.totalBouts", "official bouts") ?? "official bouts"}</span>
          </motion.div>
        ) : null}
      </section>

      {athlete.bio ? (
        <motion.section
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: 0.7, ease: [0.25, 1, 0.5, 1] }}
          className="rounded-3xl border border-border bg-surface p-8 sm:p-10 elev-card"
        >
          <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">
            {locale?.t("publicAthlete.bioEyebrow", "Bio") ?? "Bio"}
          </div>
          <p className="mt-3 text-base leading-relaxed text-secondary-muted whitespace-pre-line">{athlete.bio}</p>
        </motion.section>
      ) : null}
    </ResponsivePageShell>
  );
}
