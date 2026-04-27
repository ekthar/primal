import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, RefreshCw, Save, Shield, Shuffle, Swords, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BracketView from "@/components/tournament/BracketView";
import { ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import api from "@/lib/api";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";

export default function AdminBrackets() {
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingSeeds, setSavingSeeds] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [resultDialog, setResultDialog] = useState({
    open: false,
    matchId: "",
    winnerEntryId: "",
    method: "DEC",
    resultRound: "",
    resultTime: "",
  });
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [divisions, setDivisions] = useState([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState("");
  const [divisionPayload, setDivisionPayload] = useState(null);
  const [seedDrafts, setSeedDrafts] = useState({});

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    setLoading(true);
    const { data, error } = await api.adminTournaments();
    if (error) {
      setLoading(false);
      toast.error(error.message || "Failed to load tournaments");
      return;
    }

    const items = data?.tournaments || [];
    const nextTournamentId = items[0]?.id || "";
    setTournaments(items);
    setSelectedTournamentId(nextTournamentId);

    if (nextTournamentId) {
      await syncAndLoadDivisions(nextTournamentId, { silent: true });
    } else {
      setDivisions([]);
      setDivisionPayload(null);
      setLoading(false);
    }
  }

  async function handleSubmitResult() {
    if (!resultDialog.matchId || !resultDialog.winnerEntryId) return;
    if (!resultDialog.method || !resultDialog.resultRound || !resultDialog.resultTime) {
      toast.error("Method, round, and time are required");
      return;
    }

    setAdvancing(true);
    const { data, error } = await api.submitMatchResult(resultDialog.matchId, {
      winnerEntryId: resultDialog.winnerEntryId,
      method: resultDialog.method,
      resultRound: Number(resultDialog.resultRound),
      resultTime: resultDialog.resultTime,
    });
    setAdvancing(false);

    if (error) {
      toast.error(error.message || "Failed to record match result");
      return;
    }

    setResultDialog({
      open: false,
      matchId: "",
      winnerEntryId: "",
      method: "DEC",
      resultRound: "",
      resultTime: "",
    });
    setDivisionPayload(data);
    await refreshDivisionList(false);
  }

  async function syncAndLoadDivisions(tournamentId, { silent = false } = {}) {
    if (!tournamentId) return;
    if (!silent) setSyncing(true);
    const syncResponse = await api.syncTournamentDivisions(tournamentId);
    if (syncResponse.error) {
      if (!silent) setSyncing(false);
      setLoading(false);
      toast.error(syncResponse.error.message || "Failed to sync divisions");
      return;
    }

    const nextDivisions = syncResponse.data?.divisions || [];
    setDivisions(nextDivisions);
    const nextDivisionId = nextDivisions[0]?.id || "";
    setSelectedDivisionId((current) => (current && nextDivisions.some((division) => division.id === current) ? current : nextDivisionId));
    if (nextDivisionId) {
      await loadDivisionBracket(currentOrFallbackDivision(nextDivisions, nextDivisionId));
    } else {
      setDivisionPayload(null);
    }
    if (!silent) {
      setSyncing(false);
      toast.success("Division entries refreshed from approved applications");
    } else {
      setLoading(false);
    }
  }

  function currentOrFallbackDivision(nextDivisions, fallbackId) {
    const current = selectedDivisionId && nextDivisions.find((division) => division.id === selectedDivisionId);
    return current?.id || fallbackId;
  }

  async function loadDivisionBracket(divisionId) {
    if (!divisionId) {
      setDivisionPayload(null);
      setLoading(false);
      return;
    }
    const { data, error } = await api.getDivisionBracket(divisionId);
    setLoading(false);
    if (error) {
      toast.error(error.message || "Failed to load division bracket");
      return;
    }

    setDivisionPayload(data);
    const nextSeeds = Object.fromEntries((data?.entries || []).map((entry) => [entry.id, entry.seed || ""]));
    setSeedDrafts(nextSeeds);
  }

  async function handleTournamentChange(tournamentId) {
    setSelectedTournamentId(tournamentId);
    setLoading(true);
    await syncAndLoadDivisions(tournamentId, { silent: true });
  }

  async function handleDivisionSelect(divisionId) {
    setSelectedDivisionId(divisionId);
    setLoading(true);
    await loadDivisionBracket(divisionId);
  }

  async function handleGenerate() {
    if (!selectedDivisionId) return;
    setGenerating(true);
    const { data, error } = await api.generateDivisionBracket(selectedDivisionId, { force: false });
    setGenerating(false);
    if (error) {
      toast.error(error.message || "Failed to generate division bracket");
      return;
    }

    setDivisionPayload(data);
    await refreshDivisionList(false);
    toast.success("Bracket generated and persisted");
  }

  async function refreshDivisionList(withToast = true) {
    if (!selectedTournamentId) return;
    const { data, error } = await api.tournamentDivisions(selectedTournamentId);
    if (error) {
      toast.error(error.message || "Failed to refresh divisions");
      return;
    }
    setDivisions(data?.divisions || []);
    if (withToast) toast.success("Division board refreshed");
  }

  async function handleSaveSeeds() {
    if (!selectedDivisionId || !divisionPayload?.entries?.length) return;
    const seeds = divisionPayload.entries
      .map((entry) => ({
        entryId: entry.id,
        seed: Number(seedDrafts[entry.id] || 0),
      }))
      .filter((item) => Number.isInteger(item.seed) && item.seed > 0);

    setSavingSeeds(true);
    const { error } = await api.setDivisionManualSeeds(selectedDivisionId, { seeds });
    setSavingSeeds(false);
    if (error) {
      toast.error(error.message || "Failed to save manual seeds");
      return;
    }

    await loadDivisionBracket(selectedDivisionId);
    toast.success("Manual seeds saved");
  }

  async function handleAdvanceWinner(matchId, winnerEntryId) {
    if (!matchId || !winnerEntryId) return;
    const matches = divisionPayload?.bracket?.rounds?.flatMap((round) => round.matches || []) || [];
    const match = matches.find((item) => item.id === matchId);
    setResultDialog({
      open: true,
      matchId,
      winnerEntryId,
      method: "DEC",
      resultRound: match?.roundNumber ? String(match.roundNumber) : "",
      resultTime: "",
    });
  }

  async function handleDownload() {
    if (!selectedDivisionId) return;
    setDownloading(true);
    const { error } = await api.downloadDivisionBracketPdf(selectedDivisionId);
    setDownloading(false);
    if (error) {
      toast.error(error.message || "Failed to export division bracket");
    }
  }

  const readyDivisions = useMemo(
    () => divisions.filter((division) => Number(division.fighterCount || 0) >= 1),
    [divisions]
  );

  const selectedDivision = divisions.find((division) => division.id === selectedDivisionId) || null;
  const bracket = divisionPayload?.bracket || null;

  return (
    <ResponsivePageShell>
      <section className="rounded-[32px] overflow-hidden border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.28),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.2),transparent_32%),radial-gradient(circle_at_bottom,rgba(250,204,21,0.18),transparent_30%),linear-gradient(180deg,#0a0a0a_0%,#111111_100%)] p-7 sm:p-8 text-white shadow-[0_24px_120px_rgba(0,0,0,0.45)]">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
          <div>
            <div className="text-[10px] uppercase tracking-[0.26em] text-red-300 font-semibold">{locale?.t("adminBrackets.eyebrow", "Division Engine") ?? "Division Engine"}</div>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mt-3 max-w-3xl">
              {locale?.t("adminBrackets.heroTitle", "Persisted divisions, entries, and match progression.") ?? "Persisted divisions, entries, and match progression."}
            </h1>
            <p className="text-sm text-zinc-300 mt-4 max-w-2xl leading-6">
              Approved applications are expanded into one entry per discipline, grouped into strict divisions, and generated into a deterministic single-elimination tree with bye propagation and winner carry-forward.
            </p>

            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              <HeroMetric label="Total divisions" value={divisions.length} helper="All persisted tournament buckets" />
                <HeroMetric label="Ready divisions" value={readyDivisions.length} helper="At least one approved fighter" />
              <HeroMetric
                label="Generated matches"
                value={divisions.reduce((sum, division) => sum + Number(division.matchCount || 0), 0)}
                helper="Persisted graph nodes"
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Pill icon={Shield} text="Strict division integrity" />
              <Pill icon={Swords} text="Soft same-club avoidance" />
              <Pill icon={AlertTriangle} text="Conflict diagnostics" />
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-black/25 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">{locale?.t("adminBrackets.tournamentScope", "Tournament scope") ?? "Tournament scope"}</div>
              <Button
                variant="outline"
                className="border-zinc-700 bg-zinc-950/50 text-zinc-100 hover:bg-zinc-900"
                onClick={() => syncAndLoadDivisions(selectedTournamentId)}
                disabled={syncing || !selectedTournamentId}
              >
                <RefreshCw className="size-4" /> {syncing ? (locale?.t("adminBrackets.syncing", "Syncing...") ?? "Syncing...") : (locale?.t("adminBrackets.syncDivisions", "Sync divisions") ?? "Sync divisions")}
              </Button>
            </div>

            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{locale?.t("fields.tournament", "Tournament") ?? "Tournament"}</label>
              <select
                value={selectedTournamentId}
                onChange={(event) => handleTournamentChange(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none"
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Generation controls</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="border-zinc-700 bg-zinc-950/50 text-zinc-100 hover:bg-zinc-900"
                  onClick={handleGenerate}
                  disabled={generating || !selectedDivision || Number(selectedDivision.fighterCount || 0) < 1}
                >
                  <Shuffle className="size-4" /> {generating ? "Generating..." : Number(selectedDivision?.fighterCount || 0) === 1 ? "Declare winner" : selectedDivision?.matchCount ? "Regenerate bracket" : "Generate bracket"}
                </Button>
                <Button
                  variant="outline"
                  className="border-zinc-700 bg-zinc-950/50 text-zinc-100 hover:bg-zinc-900"
                  onClick={handleDownload}
                  disabled={downloading || !selectedDivisionId}
                >
                  <Download className="size-4" /> {downloading ? "Exporting..." : "Download PDF"}
                </Button>
              </div>
              <div className="mt-3 text-xs text-zinc-500">
                Regeneration is blocked once a division has recorded winners. Update manual seeds before generating if you need a protected bracket order.
              </div>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="mt-6">
          <SectionLoader
            title="Loading division graph"
            description="Reading tournaments, approved fighters, persisted divisions, and match progress."
            cards={3}
            rows={4}
          />
        </div>
      ) : (
        <div className="mt-6 grid xl:grid-cols-[340px_1fr] gap-5">
          <aside className="rounded-3xl border border-border bg-surface elev-card p-5 h-max">
            <div className="flex items-start gap-3">
              <Trophy className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight">Division board</h2>
                <p className="text-sm text-secondary-muted mt-1">
                  Each division is a real competition bucket grouped by tournament, discipline, sex, age band, weight class, and experience level.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {divisions.map((division) => (
                <div
                  key={division.id}
                  className={`w-full rounded-2xl border p-4 transition-all ${
                    selectedDivisionId === division.id ? "border-foreground bg-surface-muted" : "border-border bg-background/60 hover:bg-surface-muted/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleDivisionSelect(division.id)}
                    className="w-full text-left"
                  >
                    <div className="font-medium">{division.label}</div>
                    <div className="text-sm text-secondary-muted mt-1">
                      {division.fighterCount} fighters · {division.matchCount || 0} matches · {division.disciplineLabel}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-wider text-tertiary">
                      <span>{Number(division.fighterCount || 0) >= 1 ? "Active" : "Building"}</span>
                      {division.conflictCount ? <span>{division.conflictCount} conflict</span> : null}
                      {division.championName ? <span>Champion: {division.championName}</span> : null}
                    </div>
                  </button>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="outline"
                      className="h-8 border-border bg-background/60 px-3 text-xs"
                      onClick={() => api.downloadDivisionBracketPdf(division.id)}
                    >
                      <Download className="size-3.5" /> Download bracket
                    </Button>
                  </div>
                </div>
              ))}

              {!divisions.length ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-sm text-secondary-muted">
                  No divisions found yet. Sync once approved applications exist in this tournament.
                </div>
              ) : null}
            </div>
          </aside>

          <section className="space-y-5 min-w-0">
            {selectedDivision ? (
              <Tabs defaultValue="warroom" className="space-y-5">
                <TabsList className="bg-surface-muted p-1 rounded-xl h-auto flex w-full justify-start overflow-x-auto">
                  <TabsTrigger value="warroom" className="data-[state=active]:bg-surface rounded-lg px-4 py-2">War room</TabsTrigger>
                  <TabsTrigger value="seeding" className="data-[state=active]:bg-surface rounded-lg px-4 py-2">Entries & seeds</TabsTrigger>
                </TabsList>

                <TabsContent value="warroom" className="space-y-5">
                  {bracket ? (
                    <BracketView bracket={bracket} onAdvanceWinner={advancing ? undefined : handleAdvanceWinner} />
                  ) : (
                    <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-sm text-secondary-muted">
                      No persisted bracket exists for this division yet. Generate one once your entry list looks correct.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="seeding">
                  <div className="rounded-3xl border border-border bg-surface elev-card p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <h3 className="font-display text-2xl font-semibold tracking-tight">Entries and manual seeds</h3>
                        <p className="text-sm text-secondary-muted mt-1">
                          Manual seeds take precedence. Leave a seed blank to fall back to the derived heuristic score.
                        </p>
                      </div>
                      <Button onClick={handleSaveSeeds} disabled={savingSeeds || !divisionPayload?.entries?.length}>
                        <Save className="size-4" /> {savingSeeds ? "Saving..." : "Save seeds"}
                      </Button>
                    </div>

                    <div className="mt-5 grid gap-3">
                      {(divisionPayload?.entries || []).map((entry, index) => (
                        <div key={entry.id} className="rounded-2xl border border-border bg-background/60 p-4">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="min-w-0">
                              <div className="font-medium">{entry.participantName}</div>
                              <div className="mt-1 text-sm text-secondary-muted">
                                {entry.clubName || "Independent"} · Derived score {entry.derivedSeedScore}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs text-secondary-muted">
                                <Users className="size-3.5" /> Rank {index + 1}
                              </span>
                              <input
                                type="number"
                                min="1"
                                value={seedDrafts[entry.id] ?? ""}
                                onChange={(event) => setSeedDrafts((current) => ({ ...current, [entry.id]: event.target.value }))}
                                className="h-10 w-24 rounded-xl border border-border bg-background px-3 text-sm outline-none"
                                placeholder="Seed"
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      {!divisionPayload?.entries?.length ? (
                        <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-sm text-secondary-muted">
                          No entries have been synced into this division yet.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-secondary-muted">
                No divisions available for this tournament yet.
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={resultDialog.open} onOpenChange={(open) => setResultDialog((current) => ({ ...current, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record match result</DialogTitle>
            <DialogDescription>Set the winner method, round number, and finish time before saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Method</Label>
              <Select value={resultDialog.method} onValueChange={(value) => setResultDialog((current) => ({ ...current, method: value }))}>
                <SelectTrigger className="mt-1.5 h-11 bg-background">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KO">KO</SelectItem>
                  <SelectItem value="TKO">TKO</SelectItem>
                  <SelectItem value="SUB">Submission</SelectItem>
                  <SelectItem value="DEC">Decision</SelectItem>
                  <SelectItem value="DQ">DQ</SelectItem>
                  <SelectItem value="NC">NC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Round</Label>
              <Input
                type="number"
                min="1"
                value={resultDialog.resultRound}
                onChange={(event) => setResultDialog((current) => ({ ...current, resultRound: event.target.value }))}
                placeholder="1"
                className="mt-1.5 h-11 bg-background"
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Time</Label>
              <Input
                value={resultDialog.resultTime}
                onChange={(event) => setResultDialog((current) => ({ ...current, resultTime: event.target.value }))}
                placeholder="01:24"
                className="mt-1.5 h-11 bg-background"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResultDialog({ open: false, matchId: "", winnerEntryId: "", method: "DEC", resultRound: "", resultTime: "" })}>
                Cancel
              </Button>
              <Button onClick={handleSubmitResult} disabled={advancing}>
                {advancing ? "Saving..." : "Save result"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ResponsivePageShell>
  );
}

function HeroMetric({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/25 p-4">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-400">{helper}</div>
    </div>
  );
}

function Pill({ icon: Icon, text }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-300">
      <Icon className="size-3.5 text-red-300" /> {text}
    </span>
  );
}
