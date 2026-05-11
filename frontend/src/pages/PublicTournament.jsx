import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Calendar, Image as ImageIcon, MapPin, Users } from "lucide-react";
import { api } from "@/lib/api";
import { ResponsivePageShell, PageSectionHeader } from "@/components/shared/ResponsivePrimitives";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";
import PublicHero from "@/components/landing/anime/PublicHero";
import StaggerGrid from "@/components/landing/anime/StaggerGrid";
import CountUp from "@/components/landing/anime/CountUp";
import MagneticCard from "@/components/landing/anime/MagneticCard";

function formatDateRange(startsOn, endsOn) {
  if (!startsOn) return null;
  try {
    const fmt = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" });
    const start = fmt.format(new Date(startsOn));
    if (!endsOn || endsOn === startsOn) return start;
    const end = fmt.format(new Date(endsOn));
    return `${start} → ${end}`;
  } catch {
    return null;
  }
}

function Chip({ children, accent = false, delay = 0 }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      initial={reduced ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
      animate={reduced ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.5, delay, ease: [0.25, 1, 0.5, 1] }}
      className={
        accent
          ? "inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-primary"
          : "inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1"
      }
    >
      {children}
    </motion.span>
  );
}

export default function PublicTournament() {
  const locale = useLocale();
  const router = useRouter();
  const { slug } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data: payload, error } = await api.publicTournamentBySlug(slug);
      if (cancel) return;
      if (error) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setData(payload);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [slug]);

  const grouped = useMemo(() => {
    const map = new Map();
    (data?.participants || []).forEach((row) => {
      const key = row.club_name || locale?.t("publicTournament.individualClub", "Individual entries") || "Individual entries";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, locale]);

  if (loading) {
    return <ResponsivePageShell><SectionLoader /></ResponsivePageShell>;
  }
  if (notFound || !data?.tournament) {
    return (
      <ResponsivePageShell className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> {locale?.t("publicTournament.backHome", "Back to home") ?? "Back to home"}
        </Link>
        <PageSectionHeader
          eyebrow={locale?.t("publicTournament.eyebrow", "Tournament") ?? "Tournament"}
          title={locale?.t("publicTournament.notFoundTitle", "Tournament not found") ?? "Tournament not found"}
          description={locale?.t("publicTournament.notFoundDescription", "The tournament you're looking for is not public or no longer exists.") ?? "The tournament you're looking for is not public or no longer exists."}
        />
      </ResponsivePageShell>
    );
  }

  const { tournament, participants, albums } = data;
  const dateRange = formatDateRange(tournament.starts_on, tournament.ends_on);
  const totalParticipants = participants?.length || 0;
  const clubCount = grouped.length;

  return (
    <ResponsivePageShell className="space-y-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
        <ArrowLeft className="size-4" /> {locale?.t("publicTournament.backHome", "Back to home") ?? "Back to home"}
      </Link>

      <PublicHero
        eyebrow={tournament.season || locale?.t("publicTournament.eyebrow", "Tournament") || "Tournament"}
        titleParts={[{ text: tournament.name }]}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-secondary-muted">
          {dateRange ? (
            <Chip delay={0}><Calendar className="size-3.5" /> {dateRange}</Chip>
          ) : null}
          <Chip delay={0.05}>
            <Users className="size-3.5" />
            <span className="tabular-nums"><CountUp to={totalParticipants} duration={1100} /></span>
            <span>{locale?.t("publicTournament.approvedParticipants", "approved participants") ?? "approved participants"}</span>
          </Chip>
          <Chip delay={0.1}>
            <MapPin className="size-3.5" />
            <span className="tabular-nums"><CountUp to={clubCount} duration={900} /></span>
            <span>{locale?.t("publicTournament.clubs", "clubs") ?? "clubs"}</span>
          </Chip>
          {tournament.registrationOpen ? (
            <Chip accent delay={0.15}>
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              {locale?.t("publicTournament.regOpen", "Registration open") ?? "Registration open"}
            </Chip>
          ) : null}
        </div>
        {tournament.registrationOpen ? (
          <div className="mt-6">
            <Link href="/register">
              <Button size="lg" className="rounded-full bg-primary hover:bg-primary-hover text-primary-foreground">
                {locale?.t("publicTournament.registerCta", "Register to compete") ?? "Register to compete"}
                <ArrowUpRight className="size-4 ml-1" />
              </Button>
            </Link>
          </div>
        ) : null}
      </PublicHero>

      {albums?.length ? (
        <section>
          <PageSectionHeader
            eyebrow={locale?.t("publicTournament.albumsEyebrow", "Match-day moments") ?? "Match-day moments"}
            title={locale?.t("publicTournament.albumsTitle", "Photos from this tournament") ?? "Photos from this tournament"}
          />
          <StaggerGrid className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" grid={[3, 1]}>
            {albums.map((album) => (
              <MagneticCard key={album.id} maxTilt={6} className="group">
                <Link href={`/albums?id=${album.id}`} className="block overflow-hidden rounded-2xl border border-border bg-surface elev-card">
                  <div className="aspect-[16/10] bg-surface-muted overflow-hidden">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt={album.name} className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" loading="lazy" />
                    ) : (
                      <div className="size-full grid place-items-center text-tertiary">
                        <ImageIcon className="size-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">
                      {album.tournamentName || tournament.name}
                    </div>
                    <div className="mt-1 font-display text-lg font-semibold tracking-tight">{album.name}</div>
                    <div className="mt-1 text-xs text-secondary-muted">
                      {(album.photoCount || 0)} {locale?.t("publicTournament.photos", "photos") ?? "photos"}
                    </div>
                  </div>
                </Link>
              </MagneticCard>
            ))}
          </StaggerGrid>
        </section>
      ) : null}

      <section>
        <PageSectionHeader
          eyebrow={locale?.t("publicTournament.rosterEyebrow", "Roster") ?? "Roster"}
          title={locale?.t("publicTournament.rosterTitle", "Approved participants") ?? "Approved participants"}
          description={locale?.t("publicTournament.rosterDescription", "Public list of athletes whose applications have been verified for this tournament.") ?? "Public list of athletes whose applications have been verified for this tournament."}
        />
        {grouped.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-secondary-muted">
            {locale?.t("publicTournament.rosterEmpty", "No approved participants yet.") ?? "No approved participants yet."}
          </div>
        ) : (
          <StaggerGrid className="mt-6 space-y-6" grid={[1, 1]}>
            {grouped.map(([clubName, rows]) => (
              <ClubGroup key={clubName} clubName={clubName} rows={rows} />
            ))}
          </StaggerGrid>
        )}
      </section>
    </ResponsivePageShell>
  );
}

function ClubGroup({ clubName, rows }) {
  const reduced = useReducedMotion();
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-2 text-sm bg-surface-muted/50 border-b border-border">
        <MapPin className="size-3.5 text-tertiary" />
        <span className="font-medium">{clubName}</span>
        <span className="text-tertiary">·</span>
        <span className="text-tertiary tabular-nums">{rows.length}</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row, i) => (
          <motion.div
            key={row.id}
            initial={reduced ? false : { opacity: 0, x: -16 }}
            whileInView={reduced ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-5% 0px" }}
            transition={{ duration: 0.45, delay: Math.min(i * 0.04, 0.25), ease: [0.25, 1, 0.5, 1] }}
          >
            <Link
              href={`/athletes/${row.id}`}
              className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr_auto] gap-3 px-5 py-3 items-center text-sm hover:bg-surface-muted/40 transition"
            >
              <div className="font-medium">{row.first_name} {row.last_name}</div>
              <div className="text-secondary-muted">{row.discipline || "—"}</div>
              <div className="text-secondary-muted">{row.weight_class || "—"}</div>
              <ArrowUpRight className="size-4 text-tertiary justify-self-end" />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
