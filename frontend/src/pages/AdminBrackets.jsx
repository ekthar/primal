import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Shield, Shuffle, Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BracketView from "@/components/tournament/BracketView";
import {
  CATEGORY_REPORT,
  DEFAULT_BRACKETS,
  GENERATION_PRESETS,
  advanceBracketWinner,
  generateBracket,
} from "@/lib/tournamentWorkflow";

export default function AdminBrackets() {
  const bracketableCategories = useMemo(
    () => CATEGORY_REPORT.filter((category) => category.readyForBracket),
    []
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState(bracketableCategories[0]?.id || null);
  const [brackets, setBrackets] = useState(DEFAULT_BRACKETS);

  const selectedCategory = bracketableCategories.find((category) => category.id === selectedCategoryId) || null;
  const bracket = selectedCategory ? brackets[selectedCategory.id] : null;

  const regenerate = (presetId) => {
    if (!selectedCategory) return;
    setBrackets((current) => ({
      ...current,
      [selectedCategory.id]: generateBracket(selectedCategory, { seeding: presetId, status: "draft" }),
    }));
  };

  const advanceWinner = (roundIndex, matchIndex, sideIndex) => {
    if (!selectedCategory || !bracket) return;
    setBrackets((current) => ({
      ...current,
      [selectedCategory.id]: advanceBracketWinner(current[selectedCategory.id], roundIndex, matchIndex, sideIndex),
    }));
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <section className="rounded-[32px] overflow-hidden border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.22),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_28%),linear-gradient(180deg,#090909_0%,#111111_100%)] p-7 sm:p-8 text-white shadow-[0_24px_120px_rgba(0,0,0,0.45)]">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
          <div>
            <div className="text-[10px] uppercase tracking-[0.26em] text-red-300 font-semibold">Bracket Intelligence</div>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mt-3 max-w-3xl">
              Build clean fight trees. Run brutal event nights smoothly.
            </h1>
            <p className="text-sm text-zinc-300 mt-4 max-w-2xl leading-6">
              Same category only, same-club collision avoidance, fight-card fixture generation, and a visual system that feels closer to MMA broadcast graphics than a spreadsheet.
            </p>

            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              <HeroMetric label="Ready categories" value={bracketableCategories.length} helper="Bracket-capable divisions" />
              <HeroMetric
                label="Conflict-free draws"
                value={Object.values(brackets).filter((item) => (item?.generation?.summary?.sameClubCollisions || 0) === 0).length}
                helper="No same-club round 1 hits"
              />
              <HeroMetric
                label="Fight slots"
                value={Object.values(brackets).reduce((sum, item) => sum + (item?.fixtures?.length || 0), 0)}
                helper="Scheduled bouts across cards"
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Pill icon={Shield} text="Strict category integrity" />
              <Pill icon={Swords} text="Same-club avoidance" />
              <Pill icon={AlertTriangle} text="Conflict diagnostics" />
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-black/25 p-5 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Generation presets</div>
            <div className="mt-4 space-y-3">
              {GENERATION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => regenerate(preset.id)}
                  disabled={!selectedCategory}
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
            <div className="mt-4">
              <Button variant="outline" className="border-zinc-700 bg-zinc-950/50 text-zinc-100 hover:bg-zinc-900" onClick={() => selectedCategory && regenerate("fair_draw")} disabled={!selectedCategory}>
                <RefreshCw className="size-4" /> Rebuild current division
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 grid lg:grid-cols-[330px_1fr] gap-5">
        <aside className="rounded-3xl border border-border bg-surface elev-card p-5 h-max">
          <div className="flex items-start gap-3">
            <Trophy className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Bracket-ready categories</h2>
              <p className="text-sm text-secondary-muted mt-1">
                Categories are separated strictly by discipline, gender, age group, weight class, and experience level.
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
                    {sameClubHits > 0 ? `${sameClubHits} same-club warning${sameClubHits > 1 ? "s" : ""}` : "Clean opening round"}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-5">
          {selectedCategory && bracket ? (
            <>
              <Tabs defaultValue="warroom" className="space-y-5">
                <TabsList className="bg-surface-muted p-1 rounded-xl h-auto">
                  <TabsTrigger value="warroom" className="data-[state=active]:bg-surface rounded-lg px-4 py-2">War room</TabsTrigger>
                  <TabsTrigger value="policy" className="data-[state=active]:bg-surface rounded-lg px-4 py-2">Rules</TabsTrigger>
                </TabsList>

                <TabsContent value="warroom" className="space-y-5">
                  <BracketView bracket={bracket} onAdvanceWinner={advanceWinner} />
                </TabsContent>

                <TabsContent value="policy">
                  <div className="rounded-3xl border border-border bg-surface elev-card p-6">
                    <h3 className="font-display text-2xl font-semibold tracking-tight">Bracket policy for this system</h3>
                    <div className="mt-5 grid md:grid-cols-2 gap-4 text-sm">
                      <PolicyCard title="Hard rules" items={[
                        "Only same category can fight.",
                        "Unapproved or invalid entries cannot enter brackets.",
                        "Only one fighter per slot; no overlapping match placement.",
                        "Bracket remains draft until admin reviews conflicts.",
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
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-secondary-muted">
              No bracket-ready categories available yet.
            </div>
          )}
        </section>
      </div>
    </div>
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
