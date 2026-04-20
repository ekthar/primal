import { BRACKET_STATUS_LABELS } from "@/lib/tournamentWorkflow";

const STATUS_TONES = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800",
  locked: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60",
  live: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
};

export default function BracketView({ bracket, onAdvanceWinner }) {
  if (!bracket) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Automatic bracket generation</div>
          <h3 className="font-display text-2xl font-semibold tracking-tight mt-1">{bracket.categoryLabel}</h3>
          <p className="text-sm text-secondary-muted mt-1">
            {bracket.entryCount} approved fighters · {bracket.bracketSize}-slot bracket · {bracket.seeding} draw
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${STATUS_TONES[bracket.status] || STATUS_TONES.draft}`}>
          {BRACKET_STATUS_LABELS[bracket.status] || bracket.status}
        </span>
      </div>

      <div className="mt-6 overflow-x-auto">
        <div className="inline-flex min-w-full gap-4 pb-2">
          {bracket.rounds.map((round) => (
            <section key={round.id} className="min-w-[260px] flex-1">
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-tertiary font-semibold">{round.label}</div>
                <div className="text-xs text-secondary-muted mt-1">{round.matches.length} match{round.matches.length > 1 ? "es" : ""}</div>
              </div>
              <div className="space-y-4">
                {round.matches.map((match) => (
                  <article key={match.id} className="rounded-2xl border border-border bg-background/60 p-3">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-tertiary font-semibold">
                      <span>{match.label}</span>
                      <span>{match.status}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {match.sides.map((side) => (
                        <div
                          key={`${match.id}-${side.name}`}
                          className={`rounded-xl border px-3 py-2 ${side.isBye ? "border-dashed border-border bg-surface-muted/30 text-tertiary" : "border-border bg-surface"} ${
                            match.winnerIndex !== undefined && match.winnerIndex === match.sides.indexOf(side) ? "ring-1 ring-emerald-500/50" : ""
                          }`}
                        >
                          <div className="text-sm font-medium">{side.name}</div>
                          <div className="mt-1 text-[11px] text-secondary-muted">
                            {side.isBye ? "Automatic advance" : `${side.club || "TBD"}${side.seedScore ? ` · Seed ${side.seedScore}` : ""}`}
                          </div>
                          {onAdvanceWinner && !side.isBye && match.status !== "completed" && (
                            <button
                              type="button"
                              onClick={() => onAdvanceWinner(match.round - 1, Number(match.id.split("-m")[1]) - 1, match.sides.indexOf(side))}
                              className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-primary"
                            >
                              Advance winner
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
