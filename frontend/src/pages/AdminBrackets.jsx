import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Lock, RefreshCw, Shield, Shuffle, Swords, Trophy, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BracketView from "@/components/tournament/BracketView";
import { ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { GENERATION_PRESETS as FALLBACK_PRESETS } from "@/lib/brackets";
import api from "@/lib/api";
import { toast } from "sonner";

export default function AdminBrackets() {
  const [loading, setLoading] = useState(true);
  const [busyPresetId, setBusyPresetId] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [updatingBracket, setUpdatingBracket] = useState(false);
  const [downloadingBracket, setDownloadingBracket] = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [categories, setCategories] = useState([]);
  const [brackets, setBrackets] = useState({});
  const [presets, setPresets] = useState(FALLBACK_PRESETS);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  useEffect(() => {
    loadOverview();
  }, []);

  const bracketableCategories = useMemo(
    () => categories.filter((category) => category.readyForBracket),
    [categories]
  );

  const selectedCategory = bracketableCategories.find((category) => category.id === selectedCategoryId) || bracketableCategories[0] || null;
  const bracket = selectedCategory ? brackets[selectedCategory.id] : null;

  async function loadOverview(tournamentId) {
    setLoading(true);
    const { data, error } = await api.bracketOverview(tournamentId ? { tournamentId } : undefined);
    setLoading(false);
    if (error) {
      toast.error(error.message || "Failed to load brackets workspace");
      return;
    }

    const nextCategories = data?.categories || [];
    const readyCategories = nextCategories.filter((item) => item.readyForBracket);
    setTournaments(data?.tournaments || []);
    setSelectedTournamentId(data?.selectedTournamentId || "");
    setCategories(nextCategories);
    setBrackets(data?.brackets || {});
    setPresets(data?.generationPresets?.length ? data.generationPresets : FALLBACK_PRESETS);
    setSelectedCategoryId((current) => {
      if (current && readyCategories.some((item) => item.id === current)) return current;
      return readyCategories[0]?.id || null;
    });
  }

  async function regenerate(presetId) {
    if (!selectedCategory || !selectedTournamentId) return;
    setBusyPresetId(presetId);
    const { data, error } = await api.generateBracket({
      tournamentId: selectedTournamentId,
      categoryId: selectedCategory.id,
      seeding: presetId,
    });
    setBusyPresetId(null);
    if (error) {
      toast.error(error.message || "Failed to generate bracket");
      return;
    }

    setBrackets((current) => ({
      ...current,
      [selectedCategory.id]: data.bracket,
    }));
    toast.success("Bracket generated from approved participants");
  }

  async function advanceWinner(roundIndex, matchIndex, sideIndex) {
    if (!bracket?.id) return;
    setAdvancing(true);
    const { data, error } = await api.advanceBracketWinner(bracket.id, { roundIndex, matchIndex, sideIndex });
    setAdvancing(false);
    if (error) {
      toast.error(error.message || "Failed to advance bracket winner");
      return;
    }

    setBrackets((current) => ({
      ...current,
      [selectedCategory.id]: data.bracket,
    }));
  }

  async function setBracketStatus(status) {
    if (!bracket?.id) return;
    setUpdatingBracket(true);
    const { data, error } = await api.updateBracket(bracket.id, { status });
    setUpdatingBracket(false);
    if (error) {
      toast.error(error.message || "Failed to update bracket status");
      return;
    }
    setBrackets((current) => ({
      ...current,
      [selectedCategory.id]: data.bracket,
    }));
    toast.success(`Bracket marked ${status}`);
  }

  async function downloadBracket() {
    if (!bracket?.id) return;
    setDownloadingBracket(true);
    const { error } = await api.downloadBracketPdf(bracket.id);
    setDownloadingBracket(false);
    if (error) {
      toast.error(error.message || "Failed to export bracket");
      return;
    }
  }

  const savedBracketCount = useMemo(
    () => Object.values(brackets || {}).filter(Boolean).length,
    [brackets]
  );

  return (
    <ResponsivePageShell>
      <section className="rounded-[32px] overflow-hidden border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.22),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_28%),linear-gradient(180deg,#090909_0%,#111111_100%)] p-7 sm:p-8 text-white shadow-[0_24px_120px_rgba(0,0,0,0.45)]">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
          <div>
            <div className="text-[10px] uppercase tracking-[0.26em] text-red-300 font-semibold">Bracket Intelligence</div>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mt-3 max-w-3xl">
              Build clean fight trees from approved participants.
            </h1>
            <p className="text-sm text-zinc-300 mt-4 max-w-2xl leading-6">
              This screen now groups real approved applications by discipline, gender, age group, weight class, and experience level. Generation and winner advancement persist to the backend.
            </p>

            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              <HeroMetric label="Ready categories" value={bracketableCategories.length} helper="Real divisions with enough approvals" />
              <HeroMetric
                label="Saved brackets"
                value={savedBracketCount}
                helper="Persisted event trees"
              />
              <HeroMetric
                label="Fight slots"
                value={Object.values(brackets).reduce((sum, item) => sum + (item?.fixtures?.length || 0), 0)}
                helper="Scheduled bouts across saved brackets"
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Pill icon={Shield} text="Strict category integrity" />
              <Pill icon={Swords} text="Same-club avoidance" />
              <Pill icon={AlertTriangle} text="Conflict diagnostics" />
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-black/25 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Tournament scope</div>
              <Button
                variant="outline"
                className="border-zinc-700 bg-zinc-950/50 text-zinc-100 hover:bg-zinc-900"
                onClick={() => loadOverview(selectedTournamentId || undefined)}
                disabled={loading}
              >
                <RefreshCw className="size-4" /> Refresh
              </Button>
            </div>
            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Tournament</label>
              <select
                value={selectedTournamentId}
                onChange={(event) => loadOverview(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 text-sm text-zinc-100 outline-none"
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 space-y-3">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => regenerate(preset.id)}
                  disabled={!selectedCategory || busyPresetId !== null}
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-4 text-left transition-colors hover:bg-zinc-900/80 disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-white">{preset.label}</div>
                    <Shuffle className="size-4 text-red-300" />
                  </div>
                  <div className="mt-2 text-sm text-zinc-400">{preset.description}</div>
                </button>
              ))}
            </div>
            {bracket ? (
              <div className="mt-4 space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Bracket controls</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="border-zinc-700 bg-zinc-950/50 text-zinc-100 hover:bg-zinc-900"
                    onClick={() => setBracketStatus(bracket.status === "locked" ? "draft" : "locked")}
                    disabled={updatingBracket}
                  >
                    {bracket.status === "locked" ? <Unlock className="size-4" /> : <Lock className="size-4" />}
                    {bracket.status === "locked" ? "Unlock draft refresh" : "Lock bracket"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-zinc-700 bg-zinc-950/50 text-zinc-100 hover:bg-zinc-900"
                    onClick={downloadBracket}
                    disabled={downloadingBracket}
                  >
                    <Download className="size-4" /> {downloadingBracket ? "Exporting..." : "Download PDF"}
                  </Button>
                </div>
                <div className="text-xs text-zinc-500">
                  Draft brackets auto-refresh from real approved fighters. Locked, live, and completed brackets are preserved.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="mt-6">
          <SectionLoader
            title="Loading bracket model"
            description="Reading tournaments, approved fighters, and persisted event trees."
            cards={3}
            rows={4}
          />
        </div>
      ) : (
        <div className="mt-6 grid xl:grid-cols-[330px_1fr] gap-5">
          <aside className="rounded-3xl border border-border bg-surface elev-card p-5 h-max">
            <div className="flex items-start gap-3">
              <Trophy className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-tight">Bracket-ready categories</h2>
                <p className="text-sm text-secondary-muted mt-1">
                  Real approved entries grouped per tournament. Only categories with at least two approved participants can generate a bracket.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {bracketableCategories.map((category) => {
                const categoryBracket = brackets[category.id];
                const sameClubHits = categoryBracket?.generation?.summary?.sameClubCollisions || 0;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${
                      selectedCategoryId === category.id ? "border-foreground bg-surface-muted" : "border-border bg-background/60 hover:bg-surface-muted/40"
                    }`}
                  >
                    <div className="font-medium">{category.label}</div>
                    <div className="text-sm text-secondary-muted mt-1">
                      {category.approvedCount} approved · {category.clubCount} clubs · {category.rulesetLabel}
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-wider text-tertiary">
                      {categoryBracket
                        ? sameClubHits > 0
                          ? `${sameClubHits} same-club warning${sameClubHits > 1 ? "s" : ""}`
                          : "Saved bracket available"
                        : "No bracket generated yet"}
                    </div>
                  </button>
                );
              })}
              {!bracketableCategories.length && (
                <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-sm text-secondary-muted">
                  No real bracket-ready categories found for this tournament yet.
                </div>
              )}
            </div>
          </aside>

          <section className="space-y-5 min-w-0">
            {selectedCategory ? (
              <Tabs defaultValue="warroom" className="space-y-5">
                <TabsList className="bg-surface-muted p-1 rounded-xl h-auto flex w-full justify-start overflow-x-auto">
                  <TabsTrigger value="warroom" className="data-[state=active]:bg-surface rounded-lg px-4 py-2">War room</TabsTrigger>
                  <TabsTrigger value="policy" className="data-[state=active]:bg-surface rounded-lg px-4 py-2">Rules</TabsTrigger>
                </TabsList>

                <TabsContent value="warroom" className="space-y-5">
                  {bracket ? (
                    <BracketView bracket={bracket} onAdvanceWinner={advancing ? undefined : advanceWinner} />
                  ) : (
                    <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-sm text-secondary-muted">
                      No saved bracket exists for this category yet. Choose a generation preset to build one from the approved applications.
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="policy">
                  <div className="rounded-3xl border border-border bg-surface elev-card p-6">
                    <h3 className="font-display text-2xl font-semibold tracking-tight">Bracket policy for this system</h3>
                    <div className="mt-5 grid md:grid-cols-2 gap-4 text-sm">
                      <PolicyCard title="Hard rules" items={[
                        "Only approved entries from the selected tournament can enter brackets.",
                        "Categories are split by discipline, age group, gender, weight class, and experience level.",
                        "Only one fighter per slot; no overlapping match placement.",
                        "Generated brackets persist and can be advanced round by round.",
                      ]} />
                      <PolicyCard title="Soft rules" items={[
                        "Same club should not meet in round 1 if avoidable.",
                        "Top seeds should stay separated where possible.",
                        "Byes should favor cleaner bracket structure.",
                        "Fixture order should support ring/cage operations.",
                      ]} />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-secondary-muted">
                No bracket-ready categories available yet.
              </div>
            )}
          </section>
        </div>
      )}
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

function PolicyCard({ title, items }) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-5">
      <div className="font-medium">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="text-secondary-muted">{item}</div>
        ))}
      </div>
    </div>
  );
}
