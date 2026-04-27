import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, ArrowUpRight, Calendar, Image as ImageIcon, MapPin, Users } from "lucide-react";
import { api } from "@/lib/api";
import { ResponsivePageShell, PageSectionHeader } from "@/components/shared/ResponsivePrimitives";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/LocaleContext";
import KineticHeadline from "@/components/landing/anime/KineticHeadline";
import StaggerGrid from "@/components/landing/anime/StaggerGrid";

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

  return (
    <ResponsivePageShell className="space-y-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
        <ArrowLeft className="size-4" /> {locale?.t("publicTournament.backHome", "Back to home") ?? "Back to home"}
      </Link>

      <header className="relative overflow-hidden rounded-3xl border border-border bg-surface p-8 sm:p-12 elev-card">
        <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">
          {tournament.season || locale?.t("publicTournament.eyebrow", "Tournament") || "Tournament"}
        </div>
        <div className="mt-3">
          <KineticHeadline parts={[{ text: tournament.name }]} className="text-4xl sm:text-5xl lg:text-6xl" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-sm text-secondary-muted">
          {dateRange ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1">
              <Calendar className="size-3.5" /> {dateRange}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1">
            <Users className="size-3.5" /> {totalParticipants} {locale?.t("publicTournament.approvedParticipants", "approved participants") ?? "approved participants"}
          </span>
          {tournament.registrationOpen ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-primary">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              {locale?.t("publicTournament.regOpen", "Registration open") ?? "Registration open"}
            </span>
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
      </header>

      {albums?.length ? (
        <section>
          <PageSectionHeader
            eyebrow={locale?.t("publicTournament.albumsEyebrow", "Match-day moments") ?? "Match-day moments"}
            title={locale?.t("publicTournament.albumsTitle", "Photos from this tournament") ?? "Photos from this tournament"}
          />
          <StaggerGrid className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" grid={[3, 1]}>
            {albums.map((album) => (
              <Link key={album.id} href={`/albums?id=${album.id}`} className="group block overflow-hidden rounded-2xl border border-border bg-surface elev-card">
                <div className="aspect-[16/10] bg-surface-muted overflow-hidden">
                  {album.coverUrl ? (
                    <img src={album.coverUrl} alt={album.name} className="size-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
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
          <div className="mt-6 space-y-6">
            {grouped.map(([clubName, rows]) => (
              <div key={clubName} className="rounded-2xl border border-border bg-surface overflow-hidden">
                <div className="px-5 py-3 flex items-center gap-2 text-sm bg-surface-muted/50 border-b border-border">
                  <MapPin className="size-3.5 text-tertiary" />
                  <span className="font-medium">{clubName}</span>
                  <span className="text-tertiary">·</span>
                  <span className="text-tertiary">{rows.length}</span>
                </div>
                <div className="divide-y divide-border">
                  {rows.map((row) => (
                    <Link key={row.id} href={`/athletes/${row.id}`} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr_auto] gap-3 px-5 py-3 items-center text-sm hover:bg-surface-muted/40 transition">
                      <div className="font-medium">{row.first_name} {row.last_name}</div>
                      <div className="text-secondary-muted">{row.discipline || "—"}</div>
                      <div className="text-secondary-muted">{row.weight_class || "—"}</div>
                      <div className="text-tertiary text-xs sm:text-right inline-flex items-center gap-1 justify-end">
                        {locale?.t("publicTournament.viewAthlete", "View") ?? "View"} <ArrowUpRight className="size-3" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </ResponsivePageShell>
  );
}
