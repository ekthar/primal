import { AlertTriangle, Clock3, Shield, Swords, Trophy } from "lucide-react";
import { BRACKET_STATUS_LABELS } from "@/lib/brackets";

const STATUS_TONES = {
  draft: "bg-zinc-950/70 text-zinc-200 border-zinc-800",
  locked: "bg-blue-950/60 text-blue-200 border-blue-800/70",
  live: "bg-red-950/60 text-red-200 border-red-800/70",
  completed: "bg-emerald-950/60 text-emerald-200 border-emerald-800/70",
};

const CORNER_STYLES = {
  red: "border-red-500/40 bg-red-950/20",
  blue: "border-sky-500/40 bg-sky-950/20",
};

function SeverityBadge({ conflict }) {
  if (!conflict) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-200">
      <AlertTriangle className="size-3" /> {conflict.message}
    </span>
  );
}

function SideCard({ side, winner, onAdvance }) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${side.isBye ? "border-dashed border-zinc-700 bg-zinc-900/40 text-zinc-500" : CORNER_STYLES[side.corner] || "border-zinc-700 bg-zinc-900/40"} ${
        winner ? "ring-1 ring-emerald-400/60" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">{side.corner} corner</div>
          <div className="mt-1 text-sm font-semibold text-zinc-100">{side.name}</div>
        </div>
        {!side.isBye && side.seedScore ? (
          <div className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-300">
            Seed {side.seedScore}
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-[11px] text-zinc-400">
        {side.isBye ? "Automatic advance" : `${side.club || "Independent"}${side.nationality ? ` · ${side.nationality}` : ""}`}
      </div>
      {onAdvance && !side.isBye ? (
        <button
          type="button"
          onClick={onAdvance}
          className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-300 hover:text-red-200"
        >
          Advance winner
        </button>
      ) : null}
    </div>
  );
}

function FixtureTable({ fixtures }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5">
      <div className="flex items-start gap-3">
        <Clock3 className="size-5 text-red-300 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-display text-2xl font-semibold tracking-tight text-white">Fight-night fixture board</h3>
          <p className="text-sm text-zinc-400 mt-1">Operational bout schedule by session and cage assignment.</p>
        </div>
      </div>

      <div className="mt-5 space-y-3 md:hidden">
        {fixtures.map((fixture) => (
          <div key={fixture.id} className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-zinc-100">Bout #{fixture.boutNumber}</div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">{fixture.status.replace(/-/g, " ")}</div>
            </div>
            <div className="mt-2 text-sm text-zinc-400">{fixture.session} · {fixture.arena}</div>
            <div className="mt-3 text-sm text-red-200">Red: {fixture.red?.name || "Bye"}</div>
            <div className="text-sm text-sky-200">Blue: {fixture.blue?.name || "Bye"}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 border-b border-zinc-800">
              <th className="py-3">Bout</th>
              <th className="py-3">Session</th>
              <th className="py-3">Arena</th>
              <th className="py-3">Red corner</th>
              <th className="py-3">Blue corner</th>
              <th className="py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((fixture) => (
              <tr key={fixture.id} className="border-b border-zinc-900 last:border-b-0">
                <td className="py-3 text-sm text-zinc-100">#{fixture.boutNumber}</td>
                <td className="py-3 text-sm text-zinc-300">
                  <div>{fixture.session}</div>
                  <div className="text-[11px] text-zinc-500">{fixture.roundLabel}</div>
                </td>
                <td className="py-3 text-sm text-zinc-300">{fixture.arena}</td>
                <td className="py-3 text-sm text-red-200">{fixture.red?.name || "Bye"}</td>
                <td className="py-3 text-sm text-sky-200">{fixture.blue?.name || "Bye"}</td>
                <td className="py-3 text-sm text-zinc-300 capitalize">{fixture.status.replace(/-/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BracketView({ bracket, onAdvanceWinner }) {
  if (!bracket) return null;
  const finalRound = bracket.rounds?.[bracket.rounds.length - 1];
  const finalMatch = finalRound?.matches?.[0];
  const champion = finalMatch?.winnerIndex !== undefined ? finalMatch.sides?.[finalMatch.winnerIndex] : null;

  return (
    <div className="rounded-[28px] overflow-hidden border border-zinc-800 bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.16),transparent_35%),linear-gradient(180deg,#0a0a0a_0%,#111111_100%)] p-5 sm:p-6 text-white shadow-[0_20px_90px_rgba(0,0,0,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="text-[10px] uppercase tracking-[0.24em] text-red-300 font-semibold">Fight Architecture</div>
          <h3 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">{bracket.categoryLabel}</h3>
          <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
            {bracket.rulesetLabel} · {bracket.entryCount} cleared fighters · {bracket.bracketSize}-slot bracket · {bracket.seedingLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_TONES[bracket.status] || STATUS_TONES.draft}`}>
            {BRACKET_STATUS_LABELS[bracket.status] || bracket.status}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-[11px] uppercase tracking-wider text-zinc-300">
            <Shield className="size-3.5" /> Same category only
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-[11px] uppercase tracking-wider text-zinc-300">
            <Swords className="size-3.5" /> Same club avoided
          </span>
        </div>
      </div>

      <div className="mt-5 grid xl:grid-cols-[1.5fr_0.5fr] gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Generation diagnostics</div>
          <div className="mt-3 grid sm:grid-cols-4 gap-3">
            <Metric label="Penalty score" value={bracket.generation.score} helper="Lower is cleaner" />
            <Metric label="Same-club hits" value={bracket.generation.summary.sameClubCollisions} helper="Round 1 conflicts" />
            <Metric label="Seed gaps" value={bracket.generation.summary.largeSeedGaps} helper="Large opening mismatch" />
            <Metric label="Byes" value={bracket.generation.summary.byes} helper="Auto advances" />
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Policy</div>
          <div className="mt-3 space-y-2 text-sm text-zinc-300">
            <div>Same-club policy: avoid if possible</div>
            <div>Category integrity: strict</div>
            <div>Format: {bracket.policy.fixtureType}</div>
          </div>
        </div>
      </div>

      {bracket.generation.penalties.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {bracket.generation.penalties.slice(0, 4).map((penalty) => (
            <SeverityBadge key={`${penalty.code}-${penalty.message}`} conflict={{ message: penalty.message }} />
          ))}
        </div>
      ) : (
        <div className="mt-4 text-sm text-emerald-300">No round-one conflict warnings in the generated draw.</div>
      )}

      <div className="mt-6 md:hidden space-y-4">
        {bracket.rounds.map((round) => (
          <section key={round.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">{round.label}</div>
            <div className="mt-1 text-xs text-zinc-400">{round.matches.length} fight card slot{round.matches.length > 1 ? "s" : ""}</div>
            <div className="mt-4 space-y-3">
              {round.matches.map((match) => (
                <article key={match.id} className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">
                    <span>{match.label}</span>
                    <span>{match.status}</span>
                  </div>
                  {match.sides.map((side, sideIndex) => (
                    <div key={`${match.id}-${side.name}-${side.corner}`} className="mt-3">
                      <SideCard
                        side={side}
                        winner={match.winnerIndex === sideIndex}
                        onAdvance={
                          onAdvanceWinner && !side.isBye && match.status !== "completed"
                            ? () => onAdvanceWinner(match.round - 1, Number(match.id.split("-m")[1]) - 1, sideIndex)
                            : null
                        }
                      />
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 hidden md:block overflow-x-auto">
        <div className="inline-flex min-w-full gap-5 pb-2">
          {bracket.rounds.map((round) => (
            <section key={round.id} className="min-w-[320px] flex-1">
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">{round.label}</div>
                <div className="text-xs text-zinc-400 mt-1">{round.matches.length} fight card slot{round.matches.length > 1 ? "s" : ""}</div>
              </div>
              <div className="space-y-4">
                {round.matches.map((match) => (
                  <article key={match.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">
                      <span>{match.label}</span>
                      <span>{match.status}</span>
                    </div>
                    {match.conflict ? (
                      <div className="mt-3">
                        <SeverityBadge conflict={match.conflict} />
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-3">
                      {match.sides.map((side, sideIndex) => (
                        <SideCard
                          key={`${match.id}-${side.name}-${side.corner}`}
                          side={side}
                          winner={match.winnerIndex === sideIndex}
                          onAdvance={
                            onAdvanceWinner && !side.isBye && match.status !== "completed"
                              ? () => onAdvanceWinner(match.round - 1, Number(match.id.split("-m")[1]) - 1, sideIndex)
                              : null
                          }
                        />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {champion ? (
        <div className="mt-6 rounded-3xl border border-emerald-800/60 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.24),transparent_55%),linear-gradient(180deg,rgba(6,78,59,0.78),rgba(4,47,46,0.96))] p-5 text-white">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-200 font-semibold">Champion</div>
          <div className="mt-2 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-display text-2xl font-semibold tracking-tight">{champion.name}</div>
              <div className="mt-1 text-sm text-emerald-100/80">{champion.club || "Independent"}</div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-emerald-100">
              <Trophy className="size-4" /> Winner advanced
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <FixtureTable fixtures={bracket.fixtures || []} />
      </div>
    </div>
  );
}

function Metric({ label, value, helper }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-400">{helper}</div>
    </div>
  );
}
