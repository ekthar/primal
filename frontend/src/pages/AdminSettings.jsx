import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Plus, RefreshCcw, Save, Scale, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { InlineLoadingLabel, SectionLoader } from "@/components/shared/PrimalLoader";
import { PageSectionHeader, ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";
import api from "@/lib/api";
import { toast } from "sonner";

const BACKLOG_ITEMS = [
  "Public brackets/results page",
  "Weigh-in day official/tablet mode",
  "File uploads to object storage for medical/photos",
  "Custom tournament form schema renderer/editor",
  "Payments gating for paid tournaments",
  "i18n rollout on top of locale/translations",
  "Soft-delete recovery admin UI",
  "Production deployment/wiring for the Node backend",
];

const WEIGHT_CLASSES = {
  male: [
    { label: "-54 kg", max: 54 },
    { label: "-57 kg", max: 57 },
    { label: "-60 kg", max: 60 },
    { label: "-63.5 kg", max: 63.5 },
    { label: "-67 kg", max: 67 },
    { label: "-71 kg", max: 71 },
    { label: "-75 kg", max: 75 },
    { label: "-81 kg", max: 81 },
    { label: "-86 kg", max: 86 },
    { label: "-91 kg", max: 91 },
    { label: "+91 kg", max: 999 },
  ],
  female: [
    { label: "-48 kg", max: 48 },
    { label: "-52 kg", max: 52 },
    { label: "-56 kg", max: 56 },
    { label: "-60 kg", max: 60 },
    { label: "-65 kg", max: 65 },
    { label: "-70 kg", max: 70 },
    { label: "+70 kg", max: 999 },
  ],
};

function deriveWeightClass(gender, weightKg) {
  const normalizedGender = String(gender || "").toLowerCase() === "female" ? "female" : "male";
  const numeric = Number(weightKg || 0);
  const table = WEIGHT_CLASSES[normalizedGender] || WEIGHT_CLASSES.male;
  return table.find((entry) => numeric <= entry.max)?.label || "-";
}

function formatDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDisplayDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

function toIsoDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function AdminSettings({ initialTab = "tournaments" }) {
  const { user } = useAuth();
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [savingTournamentId, setSavingTournamentId] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentDrafts, setTournamentDrafts] = useState({});
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [archivingTournamentId, setArchivingTournamentId] = useState(null);
  const [newTournament, setNewTournament] = useState({
    name: "",
    slug: "",
    season: "",
    registrationOpenAt: "",
    registrationCloseAt: "",
    correctionWindowHours: "72",
    startsOn: "",
    endsOn: "",
    isPublic: "true",
  });

  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingReweigh, setLoadingReweigh] = useState(true);
  const [savingProfileId, setSavingProfileId] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [clubFilter, setClubFilter] = useState("all");
  const [participantQuery, setParticipantQuery] = useState("");
  const [participants, setParticipants] = useState([]);
  const [weightDrafts, setWeightDrafts] = useState({});
  const currentSeasonTournamentId = useMemo(() => {
    const current = tournaments.find((tournament) => tournament.is_public && !tournament.deleted_at);
    return current?.id || tournaments[0]?.id || "";
  }, [tournaments]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    loadTournaments();
    loadClubs();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    loadReweighList();
  }, [user?.role, clubFilter, participantQuery, currentSeasonTournamentId]);

  async function loadTournaments() {
    setLoadingTournaments(true);
    const { data, error } = await api.adminTournaments({ limit: 200, offset: 0 });
    setLoadingTournaments(false);
    if (error) {
      toast.error(error.message || "Failed to load tournament settings");
      return;
    }
    const rows = data?.tournaments || [];
    setTournaments(rows);
    setTournamentDrafts(
      Object.fromEntries(
        rows.map((tournament) => [
          tournament.id,
          {
            name: tournament.name || "",
            slug: tournament.slug || "",
            season: tournament.season || "",
            registrationOpenAt: formatDateTimeInput(tournament.registration_open_at),
            registrationCloseAt: formatDateTimeInput(tournament.registration_close_at),
            correctionWindowHours: tournament.correction_window_hours ? String(tournament.correction_window_hours) : "",
            startsOn: formatDateTimeInput(tournament.starts_on),
            endsOn: formatDateTimeInput(tournament.ends_on),
            isPublic: tournament.is_public ? "true" : "false",
          },
        ])
      )
    );
  }

  async function loadClubs() {
    setLoadingClubs(true);
    const { data, error } = await api.listClubs({ limit: 200, offset: 0 });
    setLoadingClubs(false);
    if (error) {
      toast.error(error.message || "Failed to load clubs");
      return;
    }
    setClubs(data?.clubs || []);
  }

  async function loadReweighList() {
    setLoadingReweigh(true);
    const { data, error } = await api.adminReweighList({
      clubId: clubFilter === "all" ? undefined : clubFilter,
      q: participantQuery || undefined,
      tournamentId: currentSeasonTournamentId || undefined,
      limit: 200,
      offset: 0,
    });
    setLoadingReweigh(false);
    if (error) {
      toast.error(error.message || "Failed to load weigh-in list");
      return;
    }
    const rows = data?.items || [];
    setParticipants(rows);
    setWeightDrafts((current) => {
      const next = { ...current };
      rows.forEach((participant) => {
        if (!(participant.id in next)) {
          next[participant.id] = participant.weight_kg ? String(participant.weight_kg) : "";
        }
      });
      return next;
    });
  }

  async function saveTournament(tournamentId) {
    const draft = tournamentDrafts[tournamentId];
    if (!draft) return;
    const body = {
      name: draft.name?.trim() || undefined,
      slug: draft.slug?.trim() || undefined,
      season: draft.season?.trim() || null,
      registrationOpenAt: toIsoDateTime(draft.registrationOpenAt),
      registrationCloseAt: toIsoDateTime(draft.registrationCloseAt),
      correctionWindowHours: draft.correctionWindowHours ? Number(draft.correctionWindowHours) : null,
      startsOn: toIsoDateTime(draft.startsOn),
      endsOn: toIsoDateTime(draft.endsOn),
      isPublic: draft.isPublic === "true",
    };

    setSavingTournamentId(tournamentId);
    const { data, error } = await api.updateTournament(tournamentId, body);
    setSavingTournamentId(null);
    if (error) {
      toast.error(error.message || "Failed to update tournament");
      return;
    }

    const updated = data?.tournament;
    setTournaments((current) => current.map((row) => (row.id === tournamentId ? updated : row)));
    setTournamentDrafts((current) => ({
      ...current,
      [tournamentId]: {
        name: updated.name || "",
        slug: updated.slug || "",
        season: updated.season || "",
        registrationOpenAt: formatDateTimeInput(updated.registration_open_at),
        registrationCloseAt: formatDateTimeInput(updated.registration_close_at),
        correctionWindowHours: updated.correction_window_hours ? String(updated.correction_window_hours) : "",
        startsOn: formatDateTimeInput(updated.starts_on),
        endsOn: formatDateTimeInput(updated.ends_on),
        isPublic: updated.is_public ? "true" : "false",
      },
    }));
    toast.success("Tournament settings updated");
  }

  async function createTournament() {
    if (!newTournament.name.trim() || !newTournament.slug.trim()) {
      toast.error("Season name and slug are required");
      return;
    }

    setCreatingTournament(true);
    const { data, error } = await api.createTournament({
      name: newTournament.name.trim(),
      slug: newTournament.slug.trim(),
      season: newTournament.season.trim() || null,
      registrationOpenAt: toIsoDateTime(newTournament.registrationOpenAt),
      registrationCloseAt: toIsoDateTime(newTournament.registrationCloseAt),
      correctionWindowHours: newTournament.correctionWindowHours ? Number(newTournament.correctionWindowHours) : null,
      startsOn: toIsoDateTime(newTournament.startsOn),
      endsOn: toIsoDateTime(newTournament.endsOn),
      isPublic: newTournament.isPublic === "true",
    });
    setCreatingTournament(false);
    if (error) {
      toast.error(error.message || "Failed to create tournament");
      return;
    }

    const created = data?.tournament;
    setTournaments((current) => [created, ...current]);
    setTournamentDrafts((current) => ({
      ...current,
      [created.id]: {
        name: created.name || "",
        slug: created.slug || "",
        season: created.season || "",
        registrationOpenAt: formatDateTimeInput(created.registration_open_at),
        registrationCloseAt: formatDateTimeInput(created.registration_close_at),
        correctionWindowHours: created.correction_window_hours ? String(created.correction_window_hours) : "",
        startsOn: formatDateTimeInput(created.starts_on),
        endsOn: formatDateTimeInput(created.ends_on),
        isPublic: created.is_public ? "true" : "false",
      },
    }));
    setNewTournament({
      name: "",
      slug: "",
      season: "",
      registrationOpenAt: "",
      registrationCloseAt: "",
      correctionWindowHours: "72",
      startsOn: "",
      endsOn: "",
      isPublic: "true",
    });
    toast.success("New season created");
  }

  async function archiveTournament(tournamentId) {
    setArchivingTournamentId(tournamentId);
    const { error } = await api.deleteTournament(tournamentId);
    setArchivingTournamentId(null);
    if (error) {
      toast.error(error.message || "Failed to archive tournament");
      return;
    }
    setTournaments((current) => current.filter((row) => row.id !== tournamentId));
    setTournamentDrafts((current) => {
      const next = { ...current };
      delete next[tournamentId];
      return next;
    });
    toast.success("Tournament archived");
  }

  async function saveReweigh(profileId) {
    const raw = String(weightDrafts[profileId] || "").trim();
    if (!raw) {
      toast.error("Enter a weigh-in value");
      return;
    }

    setSavingProfileId(profileId);
    const { data, error } = await api.adminReweigh(profileId, { weightKg: Number(raw) });
    setSavingProfileId(null);
    if (error) {
      toast.error(error.message || "Failed to update weigh-in weight");
      return;
    }

    const updated = data?.profile;
    setParticipants((current) => current.map((row) => (row.id === profileId ? { ...row, ...updated } : row)));
    setWeightDrafts((current) => ({ ...current, [profileId]: updated.weight_kg ? String(updated.weight_kg) : "" }));
    toast.success("Weigh-in updated and regrouping weight class refreshed");
  }

  const participantsByClub = useMemo(() => {
    const map = new Map();
    participants.forEach((participant) => {
      const key = participant.club_name || "Independent";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(participant);
    });
    return Array.from(map.entries());
  }, [participants]);

  if (user?.role !== "admin") {
    return <div className="p-10 text-sm text-secondary-muted">Only admin can open workflow settings.</div>;
  }

  return (
    <ResponsivePageShell className="space-y-6">
      <PageSectionHeader
        eyebrow="Admin settings"
        title="Registration windows and weigh-in control"
        description="Manage per-tournament registration timing, correction windows, and club-wise weigh-in updates that automatically refresh weight class for grouping."
      />

      <Tabs defaultValue={initialTab} className="space-y-5">
        <TabsList className="bg-surface-muted p-1 rounded-xl h-auto flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="tournaments" className="data-[state=active]:bg-surface rounded-lg px-4 py-2">Tournament windows</TabsTrigger>
          <TabsTrigger value="weighin" className="data-[state=active]:bg-surface rounded-lg px-4 py-2">Weigh-in updates</TabsTrigger>
          <TabsTrigger value="backlog" className="data-[state=active]:bg-surface rounded-lg px-4 py-2">Pending roadmap</TabsTrigger>
        </TabsList>

        <TabsContent value="tournaments">
          <section className="rounded-3xl border border-border bg-surface elev-card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <CalendarRange className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Per-tournament registration control</h2>
                  <p className="text-sm text-secondary-muted mt-1">
                    Registration stays viewable after close, but draft edit/submit remains limited to the configured registration window.
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={loadTournaments}>
                <RefreshCcw className="size-4" /> Refresh
              </Button>
            </div>

            {loadingTournaments ? (
              <div className="mt-5">
                <SectionLoader
                  title="Loading tournament windows"
                  description="Pulling registration, correction, and visibility settings for every event."
                  cards={2}
                  rows={3}
                  compact
                />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <article className="rounded-2xl border border-border bg-background/50 p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-display text-xl font-semibold tracking-tight">Create a new season</div>
                      <div className="mt-2 text-sm text-secondary-muted">
                        Add a new tournament window here instead of relying on the seeded 2026 event.
                      </div>
                    </div>
                    <Button onClick={createTournament} disabled={creatingTournament}>
                      <InlineLoadingLabel loading={creatingTournament} loadingText="Creating...">
                        <>
                          <Plus className="size-4" /> Create season
                        </>
                      </InlineLoadingLabel>
                    </Button>
                  </div>

                  <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    <Field label="Season name">
                      <Input
                        className="h-10 bg-surface"
                        value={newTournament.name}
                        onChange={(event) => setNewTournament((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Season 2027 Championship"
                      />
                    </Field>
                    <Field label="Slug">
                      <Input
                        className="h-10 bg-surface"
                        value={newTournament.slug}
                        onChange={(event) => setNewTournament((current) => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") }))}
                        placeholder="season-2027"
                      />
                    </Field>
                    <Field label="Season label">
                      <Input
                        className="h-10 bg-surface"
                        value={newTournament.season}
                        onChange={(event) => setNewTournament((current) => ({ ...current, season: event.target.value }))}
                        placeholder="season-2027"
                      />
                    </Field>
                    <Field label="Registration opens">
                      <Input
                        type="datetime-local"
                        className="h-10 bg-surface"
                        value={newTournament.registrationOpenAt}
                        onChange={(event) => setNewTournament((current) => ({ ...current, registrationOpenAt: event.target.value }))}
                      />
                    </Field>
                    <Field label="Registration closes">
                      <Input
                        type="datetime-local"
                        className="h-10 bg-surface"
                        value={newTournament.registrationCloseAt}
                        onChange={(event) => setNewTournament((current) => ({ ...current, registrationCloseAt: event.target.value }))}
                      />
                    </Field>
                    <Field label="Correction window (hours)">
                      <Input
                        type="number"
                        min="1"
                        max="720"
                        className="h-10 bg-surface"
                        value={newTournament.correctionWindowHours}
                        onChange={(event) => setNewTournament((current) => ({ ...current, correctionWindowHours: event.target.value }))}
                      />
                    </Field>
                    <Field label="Tournament starts">
                      <Input
                        type="datetime-local"
                        className="h-10 bg-surface"
                        value={newTournament.startsOn}
                        onChange={(event) => setNewTournament((current) => ({ ...current, startsOn: event.target.value }))}
                      />
                    </Field>
                    <Field label="Tournament ends">
                      <Input
                        type="datetime-local"
                        className="h-10 bg-surface"
                        value={newTournament.endsOn}
                        onChange={(event) => setNewTournament((current) => ({ ...current, endsOn: event.target.value }))}
                      />
                    </Field>
                    <Field label="Public visibility">
                      <Select
                        value={newTournament.isPublic}
                        onValueChange={(value) => setNewTournament((current) => ({ ...current, isPublic: value }))}
                      >
                        <SelectTrigger className="h-10 bg-surface">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Public</SelectItem>
                          <SelectItem value="false">Private</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </article>

                {tournaments.map((tournament) => {
                  const draft = tournamentDrafts[tournament.id] || {};
                  return (
                    <article key={tournament.id} className="rounded-2xl border border-border bg-background/50 p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="font-display text-xl font-semibold tracking-tight">{tournament.name}</div>
                          <div className="text-xs text-tertiary mt-1">{tournament.slug}</div>
                          <div className="mt-2 text-sm text-secondary-muted">
                            Current window: {formatDisplayDate(tournament.registration_open_at)} to {formatDisplayDate(tournament.registration_close_at)}
                          </div>
                          <div className="text-sm text-secondary-muted">
                            Correction window: {tournament.correction_window_hours || "Not set"} hour(s)
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" onClick={() => archiveTournament(tournament.id)} disabled={archivingTournamentId === tournament.id}>
                            <InlineLoadingLabel loading={archivingTournamentId === tournament.id} loadingText="Archiving...">
                              <>
                                <Trash2 className="size-4" /> Archive
                              </>
                            </InlineLoadingLabel>
                          </Button>
                          <Button onClick={() => saveTournament(tournament.id)} disabled={savingTournamentId === tournament.id}>
                            <InlineLoadingLabel loading={savingTournamentId === tournament.id} loadingText="Saving...">
                              <>
                                <Save className="size-4" /> Save
                              </>
                            </InlineLoadingLabel>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        <Field label="Season name">
                          <Input
                            className="h-10 bg-surface"
                            value={draft.name || ""}
                            onChange={(event) => setTournamentDrafts((current) => ({
                              ...current,
                              [tournament.id]: { ...current[tournament.id], name: event.target.value },
                            }))}
                          />
                        </Field>
                        <Field label="Slug">
                          <Input
                            className="h-10 bg-surface"
                            value={draft.slug || ""}
                            onChange={(event) => setTournamentDrafts((current) => ({
                              ...current,
                              [tournament.id]: { ...current[tournament.id], slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") },
                            }))}
                          />
                        </Field>
                        <Field label="Season label">
                          <Input
                            className="h-10 bg-surface"
                            value={draft.season || ""}
                            onChange={(event) => setTournamentDrafts((current) => ({
                              ...current,
                              [tournament.id]: { ...current[tournament.id], season: event.target.value },
                            }))}
                          />
                        </Field>
                        <Field label="Registration opens">
                          <Input
                            type="datetime-local"
                            className="h-10 bg-surface"
                            value={draft.registrationOpenAt || ""}
                            onChange={(event) => setTournamentDrafts((current) => ({
                              ...current,
                              [tournament.id]: { ...current[tournament.id], registrationOpenAt: event.target.value },
                            }))}
                          />
                        </Field>
                        <Field label="Registration closes">
                          <Input
                            type="datetime-local"
                            className="h-10 bg-surface"
                            value={draft.registrationCloseAt || ""}
                            onChange={(event) => setTournamentDrafts((current) => ({
                              ...current,
                              [tournament.id]: { ...current[tournament.id], registrationCloseAt: event.target.value },
                            }))}
                          />
                        </Field>
                        <Field label="Correction window (hours)">
                          <Input
                            type="number"
                            min="1"
                            max="720"
                            className="h-10 bg-surface"
                            value={draft.correctionWindowHours || ""}
                            onChange={(event) => setTournamentDrafts((current) => ({
                              ...current,
                              [tournament.id]: { ...current[tournament.id], correctionWindowHours: event.target.value },
                            }))}
                          />
                        </Field>
                        <Field label="Tournament starts">
                          <Input
                            type="datetime-local"
                            className="h-10 bg-surface"
                            value={draft.startsOn || ""}
                            onChange={(event) => setTournamentDrafts((current) => ({
                              ...current,
                              [tournament.id]: { ...current[tournament.id], startsOn: event.target.value },
                            }))}
                          />
                        </Field>
                        <Field label="Tournament ends">
                          <Input
                            type="datetime-local"
                            className="h-10 bg-surface"
                            value={draft.endsOn || ""}
                            onChange={(event) => setTournamentDrafts((current) => ({
                              ...current,
                              [tournament.id]: { ...current[tournament.id], endsOn: event.target.value },
                            }))}
                          />
                        </Field>
                        <Field label="Public visibility">
                          <Select
                            value={draft.isPublic || "false"}
                            onValueChange={(value) => setTournamentDrafts((current) => ({
                              ...current,
                              [tournament.id]: { ...current[tournament.id], isPublic: value },
                            }))}
                          >
                            <SelectTrigger className="h-10 bg-surface">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Public</SelectItem>
                              <SelectItem value="false">Private</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                    </article>
                  );
                })}
                {!tournaments.length && <div className="text-sm text-secondary-muted">No tournaments found.</div>}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="weighin">
          <section className="rounded-3xl border border-border bg-surface elev-card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <Scale className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Club-wise participant weigh-in updates</h2>
                  <p className="text-sm text-secondary-muted mt-1">
                    Enter measured match-day weight, recalculate weight class immediately, and let downstream grouping read the refreshed profile values.
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={loadReweighList}>
                <RefreshCcw className="size-4" /> Refresh
              </Button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
              <Field label="Club filter">
                <Select value={clubFilter} onValueChange={setClubFilter}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clubs</SelectItem>
                    {clubs.map((club) => (
                      <SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Search participant">
                <Input
                  className="h-10 bg-background"
                  value={participantQuery}
                  onChange={(event) => setParticipantQuery(event.target.value)}
                  placeholder="Search fighter, email, or club"
                />
              </Field>
            </div>

            {loadingClubs || loadingReweigh ? (
              <div className="mt-5">
                <SectionLoader
                  title="Loading weigh-in board"
                  description="Building the club-by-club participant list and current weight classes."
                  cards={2}
                  rows={5}
                  compact
                />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {participantsByClub.map(([clubName, rows]) => (
                  <section key={clubName} className="rounded-2xl border border-border bg-background/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border font-medium text-sm">{clubName}</div>
                    <div className="md:hidden space-y-3 p-4">
                      {rows.map((participant) => {
                        const draftWeight = weightDrafts[participant.id] || "";
                        return (
                          <article key={participant.id} className="rounded-2xl border border-border bg-surface p-4">
                            <div className="font-medium">{participant.first_name} {participant.last_name}</div>
                            <div className="mt-1 text-[11px] text-tertiary">{participant.email || "-"}</div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                              <DetailLite label="Current weight" value={participant.weight_kg ? `${participant.weight_kg} kg` : "-"} />
                              <DetailLite label="Current class" value={participant.weight_class || "-"} />
                              <DetailLite label="New class" value={draftWeight ? deriveWeightClass(participant.gender, draftWeight) : "-"} />
                            </div>
                            <div className="mt-4">
                              <Input
                                type="number"
                                min="1"
                                max="300"
                                step="0.1"
                                className="h-10 bg-surface"
                                value={draftWeight}
                                onChange={(event) => setWeightDrafts((current) => ({ ...current, [participant.id]: event.target.value }))}
                              />
                            </div>
                            <div className="mt-4">
                              <Button className="w-full" size="sm" onClick={() => saveReweigh(participant.id)} disabled={savingProfileId === participant.id}>
                                <InlineLoadingLabel loading={savingProfileId === participant.id} loadingText="Saving...">
                                  <>
                                    <Save className="size-3.5" /> Save weigh-in
                                  </>
                                </InlineLoadingLabel>
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                            <th className="px-4 py-3">Participant</th>
                            <th className="px-4 py-3">Current weight</th>
                            <th className="px-4 py-3">Current class</th>
                            <th className="px-4 py-3">Weigh-in update</th>
                            <th className="px-4 py-3">Recalculated class</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((participant) => {
                            const draftWeight = weightDrafts[participant.id] || "";
                            return (
                              <tr key={participant.id} className="border-b border-border last:border-b-0">
                                <td className="px-4 py-3 text-sm">
                                  <div className="font-medium">{participant.first_name} {participant.last_name}</div>
                                  <div className="text-[11px] text-tertiary mt-1">{participant.email || "-"}</div>
                                </td>
                                <td className="px-4 py-3 text-sm">{participant.weight_kg ? `${participant.weight_kg} kg` : "-"}</td>
                                <td className="px-4 py-3 text-sm">{participant.weight_class || "-"}</td>
                                <td className="px-4 py-3">
                                  <Input
                                    type="number"
                                    min="1"
                                    max="300"
                                    step="0.1"
                                    className="h-10 min-w-28 bg-surface"
                                    value={draftWeight}
                                    onChange={(event) => setWeightDrafts((current) => ({ ...current, [participant.id]: event.target.value }))}
                                  />
                                </td>
                                <td className="px-4 py-3 text-sm">{draftWeight ? deriveWeightClass(participant.gender, draftWeight) : "-"}</td>
                                <td className="px-4 py-3 text-right">
                                  <Button size="sm" onClick={() => saveReweigh(participant.id)} disabled={savingProfileId === participant.id}>
                                    <InlineLoadingLabel loading={savingProfileId === participant.id} loadingText="Saving...">
                                      <>
                                        <Save className="size-3.5" /> Save
                                      </>
                                    </InlineLoadingLabel>
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
                {!participants.length && <div className="text-sm text-secondary-muted">No participants found for the selected filters.</div>}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="backlog">
          <section className="rounded-3xl border border-border bg-surface elev-card p-6">
            <div className="flex items-start gap-3">
              <Settings2 className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight">Still pending from the old roadmap</h2>
                <p className="text-sm text-secondary-muted mt-1">
                  Kept visible here so the remaining workflow items stay attached to the admin implementation work.
                </p>
              </div>
            </div>
            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              {BACKLOG_ITEMS.map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-background/50 px-4 py-4 text-sm">
                  {item}
                </div>
              ))}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </ResponsivePageShell>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function DetailLite({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
