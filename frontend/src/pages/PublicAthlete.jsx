import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { ResponsivePageShell, PageSectionHeader } from "@/components/shared/ResponsivePrimitives";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { useLocale } from "@/context/LocaleContext";
import KineticHeadline from "@/components/landing/anime/KineticHeadline";
import CountUp from "@/components/landing/anime/CountUp";

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

export default function PublicAthlete() {
  const locale = useLocale();
  const router = useRouter();
  const { id } = router.query;
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
  const age = ageFromDob(athlete.date_of_birth);
  const wins = Number(athlete.record_wins || 0);
  const losses = Number(athlete.record_losses || 0);
  const draws = Number(athlete.record_draws || 0);

  const stats = [
    { label: locale?.t("publicAthlete.wins", "Wins") ?? "Wins", to: wins },
    { label: locale?.t("publicAthlete.losses", "Losses") ?? "Losses", to: losses },
    { label: locale?.t("publicAthlete.draws", "Draws") ?? "Draws", to: draws },
  ];

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

      <header className="relative overflow-hidden rounded-3xl border border-border bg-surface p-8 sm:p-12 elev-card">
        <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold flex items-center gap-2">
          <Trophy className="size-3.5" />
          {athlete.tournament_name || locale?.t("publicAthlete.eyebrow", "Athlete") || "Athlete"}
        </div>
        <div className="mt-3">
          <KineticHeadline parts={[{ text: fullName }]} className="text-4xl sm:text-5xl lg:text-6xl" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-secondary-muted">
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
      </header>

      <section className="rounded-3xl border border-border bg-surface p-8 sm:p-10 elev-card">
        <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">
          {locale?.t("publicAthlete.recordEyebrow", "Career record") ?? "Career record"}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-6 sm:gap-10">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-2">
              <div className="font-display text-5xl sm:text-6xl font-semibold tracking-tight tabular-nums">
                <CountUp to={s.to} />
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-tertiary font-semibold">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {athlete.bio ? (
        <section className="rounded-3xl border border-border bg-surface p-8 sm:p-10 elev-card">
          <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">
            {locale?.t("publicAthlete.bioEyebrow", "Bio") ?? "Bio"}
          </div>
          <p className="mt-3 text-base leading-relaxed text-secondary-muted whitespace-pre-line">{athlete.bio}</p>
        </section>
      ) : null}
    </ResponsivePageShell>
  );
}
