import { useMemo, useState } from "react";
import { RefreshCw, Shuffle, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import BracketView from "@/components/tournament/BracketView";
import {
  CATEGORY_REPORT,
  DEFAULT_BRACKETS,
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

  const regenerate = (seeding) => {
    if (!selectedCategory) return;
    setBrackets((current) => ({
      ...current,
      [selectedCategory.id]: generateBracket(selectedCategory, { seeding, status: "draft" }),
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Bracket management</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">Automatic bracket generation</h1>
          <p className="text-sm text-secondary-muted mt-2 max-w-3xl">
            Generate brackets separately per discipline and category, with byes for uneven counts and seeded or random draws.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => regenerate("random")} disabled={!selectedCategory}>
            <Shuffle className="size-4" /> Random draw
          </Button>
          <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={() => regenerate("seeded")} disabled={!selectedCategory}>
            <RefreshCw className="size-4" /> Regenerate bracket
          </Button>
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-[320px_1fr] gap-5">
        <aside className="rounded-3xl border border-border bg-surface elev-card p-5 h-max">
          <div className="flex items-start gap-3">
            <Trophy className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Ready categories</h2>
              <p className="text-sm text-secondary-muted mt-1">Only categories with enough approved fighters are listed here.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {bracketableCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-all ${selectedCategoryId === category.id ? "border-foreground bg-surface-muted" : "border-border bg-background/60 hover:bg-surface-muted/40"}`}
              >
                <div className="font-medium">{category.label}</div>
                <div className="text-sm text-secondary-muted mt-1">
                  {category.approvedCount} approved · {category.pendingCount} pending
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-5">
          {selectedCategory && bracket ? (
            <>
              <BracketView bracket={bracket} onAdvanceWinner={advanceWinner} />
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="font-display text-xl font-semibold tracking-tight">Bracket controls</div>
                <p className="text-sm text-secondary-muted mt-2">
                  Status flow: draft while organizers review the draw, locked when the bracket is frozen, live when results are being entered, completed after the winner is confirmed. Use the bracket cards to advance winners round by round.
                </p>
                <div className="grid sm:grid-cols-4 gap-3 mt-4">
                  {["draft", "locked", "live", "completed"].map((status) => (
                    <div key={status} className="rounded-xl border border-border bg-background/60 px-3 py-4">
                      <div className="font-medium capitalize">{status}</div>
                      <div className="text-xs text-secondary-muted mt-1">
                        {status === "draft" && "Safe to reset or regenerate"}
                        {status === "locked" && "Ready for publication"}
                        {status === "live" && "Fight results in progress"}
                        {status === "completed" && "Podium and archive ready"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
