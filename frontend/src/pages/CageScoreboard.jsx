import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const RESULT_METHODS = [
  { code: "KO", label: "Knockout" },
  { code: "TKO", label: "Technical KO" },
  { code: "SUB", label: "Submission" },
  { code: "DEC", label: "Decision" },
  { code: "DQ", label: "Disqualification" },
  { code: "NC", label: "No contest" },
];

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clubLine(entry) {
  if (!entry) return "";
  const club = entry.clubName && entry.clubName.trim();
  return club ? club : "Independent";
}

function FighterPanel({
  side,
  color,
  entry,
  fallbackName,
  score,
  onScore,
  isWinner,
}) {
  const align = side === "left" ? "items-start text-left" : "items-end text-right";
  const name = entry?.participantName || fallbackName;
  return (
    <div className={`flex flex-col ${align} flex-1 px-6 py-8 ${color}`}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/70 font-semibold">
        {side === "left" ? "Red corner" : "Blue corner"}
      </div>
      <div className="font-display text-3xl sm:text-5xl font-semibold tracking-tight w-full break-words">
        {name}
      </div>
      <div className="mt-1 text-xs text-white/80 truncate w-full">
        {clubLine(entry)}
      </div>
      {entry?.weightKg ? (
        <div className="mt-0.5 text-[11px] text-white/70 tabular-nums">
          {Number(entry.weightKg).toFixed(2)} kg
          {entry.seed != null ? ` · seed ${entry.seed}` : ""}
        </div>
      ) : entry?.seed != null ? (
        <div className="mt-0.5 text-[11px] text-white/70 tabular-nums">
          seed {entry.seed}
        </div>
      ) : null}
      <div className="mt-6 text-[12vw] sm:text-[10vw] lg:text-[8vw] font-display font-extrabold leading-none tabular-nums">
        {score}
      </div>
      <div className={`mt-6 flex flex-wrap gap-3 ${side === "right" ? "justify-end" : ""}`}>
        <button
          type="button"
          onClick={() => onScore(-1)}
          className="rounded-2xl bg-white/15 hover:bg-white/25 px-5 py-3 text-2xl font-semibold"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onScore(1)}
          className="rounded-2xl bg-white/25 hover:bg-white/35 px-5 py-3 text-2xl font-semibold"
        >
          +1
        </button>
        <button
          type="button"
          onClick={() => onScore(2)}
          className="rounded-2xl bg-white/25 hover:bg-white/35 px-5 py-3 text-2xl font-semibold"
        >
          +2
        </button>
        <button
          type="button"
          onClick={() => onScore(3)}
          className="rounded-2xl bg-white/25 hover:bg-white/35 px-5 py-3 text-2xl font-semibold"
        >
          +3
        </button>
      </div>
      {isWinner ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
          <Trophy className="size-3.5" /> Winner
        </div>
      ) : null}
    </div>
  );
}

export default function CageScoreboard() {
  const router = useRouter();
  const matchId = (router.query?.match || "").toString();

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [redScore, setRedScore] = useState(0);
  const [blueScore, setBlueScore] = useState(0);
  const [round, setRound] = useState(1);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const [showResult, setShowResult] = useState(false);
  const [winnerSide, setWinnerSide] = useState("red");
  const [method, setMethod] = useState("DEC");
  const [resultRound, setResultRound] = useState(3);
  const [resultTimeMin, setResultTimeMin] = useState(5);
  const [resultTimeSec, setResultTimeSec] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [doctorNotes, setDoctorNotes] = useState("");
  const [refereeNotes, setRefereeNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);

  const intervalRef = useRef(null);

  useEffect(() => {
    if (!matchId) {
      setMatch(null);
      setLoadError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api
      .getMatch(matchId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(error.message || "Failed to load match");
          setMatch(null);
          return;
        }
        setMatch(data);
        if (data?.resultRound) setResultRound(Number(data.resultRound));
        if (data?.resultTime && TIME_PATTERN.test(data.resultTime)) {
          const [mm, ss] = data.resultTime.split(":").map(Number);
          setResultTimeMin(mm);
          setResultTimeSec(ss);
        }
        if (data?.winnerEntryId && data?.entry1?.id === data.winnerEntryId) {
          setWinnerSide("red");
        } else if (data?.winnerEntryId && data?.entry2?.id === data.winnerEntryId) {
          setWinnerSide("blue");
        }
        if (data?.resultMethod) setMethod(data.resultMethod);
        setDoctorNotes(data?.doctorNotes || "");
        setRefereeNotes(data?.refereeNotes || "");
        setNotesDirty(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || "Failed to load match");
        setMatch(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const time = useMemo(() => fmt(seconds), [seconds]);

  function nextRound() {
    setRound((r) => r + 1);
    setSeconds(0);
    setRunning(false);
  }

  function reset() {
    setRedScore(0);
    setBlueScore(0);
    setRound(1);
    setSeconds(0);
    setRunning(false);
  }

  function openResultDialog() {
    if (!match) {
      toast.error("Open this scoreboard from a bracket match (use the cage button on AdminBrackets).");
      return;
    }
    if (!match.entry1?.id || !match.entry2?.id) {
      toast.error("Both fighters must be assigned before submitting a result.");
      return;
    }
    if (match.status === "completed") {
      toast.error("This match has already been recorded.");
      return;
    }
    if (redScore !== blueScore) {
      setWinnerSide(redScore > blueScore ? "red" : "blue");
    }
    if (round > resultRound) setResultRound(round);
    if (seconds > 0) {
      const m = Math.min(59, Math.floor(seconds / 60));
      const s = seconds % 60;
      setResultTimeMin(m);
      setResultTimeSec(s);
    }
    setShowResult(true);
  }

  async function saveNotes() {
    if (!match) return;
    setSavingNotes(true);
    try {
      const { error } = await api.setMatchNotes(match.id, {
        doctorNotes: doctorNotes || "",
        refereeNotes: refereeNotes || "",
      });
      if (error) throw new Error(error.message || "Failed to save notes");
      toast.success("Notes saved.");
      setNotesDirty(false);
    } catch (err) {
      toast.error(err.message || "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  }

  async function commitResult() {
    if (!match || !match.entry1?.id || !match.entry2?.id) {
      toast.error("Match details are missing.");
      return;
    }

    const winnerEntryId =
      winnerSide === "red" ? match.entry1.id : match.entry2.id;

    const time_str = `${String(resultTimeMin).padStart(2, "0")}:${String(resultTimeSec).padStart(2, "0")}`;
    if (!TIME_PATTERN.test(time_str)) {
      toast.error("Time must be mm:ss (e.g. 01:24)");
      return;
    }
    if (!resultRound || resultRound < 1) {
      toast.error("Result round is required");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await api.submitMatchResult(match.id, {
        winnerEntryId,
        method,
        resultRound: Number(resultRound),
        resultTime: time_str,
      });
      if (error) throw new Error(error.message || "Failed to submit");
      toast.success("Result submitted — winner advanced.");
      setShowResult(false);
      // Reload match to reflect completed status / propagation
      const reload = await api.getMatch(match.id);
      if (!reload.error) setMatch(reload.data);
    } catch (err) {
      toast.error(err.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const completed = match?.status === "completed";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="px-6 py-3 flex items-center justify-between border-b border-white/10 gap-3 flex-wrap">
        <div className="flex flex-col">
          <div className="font-display text-xl tracking-tight font-semibold">
            Cage-side scoreboard
          </div>
          {match ? (
            <div className="text-xs text-white/70 mt-0.5">
              {match.tournament?.name ? `${match.tournament.name} · ` : ""}
              {match.division?.label || "Division"}
              {" · "}Round {match.roundNumber} · Match {match.matchNumber}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-white/70">
          {matchId ? (
            <span className="font-mono">match · {matchId.slice(0, 8)}</span>
          ) : (
            <span>standalone (no match selected)</span>
          )}
          <button
            type="button"
            onClick={() => router.push("/admin/brackets")}
            className="rounded-md bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px]"
          >
            Choose match
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 grid place-items-center text-white/70">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin" /> Loading match…
          </div>
        </div>
      ) : loadError ? (
        <div className="flex-1 grid place-items-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-rose-950/40 border border-rose-500/30 p-6 text-center">
            <AlertTriangle className="size-8 mx-auto text-rose-300" />
            <div className="mt-3 font-display text-lg font-semibold">
              Couldn&apos;t load match
            </div>
            <div className="mt-1 text-sm text-white/80">{loadError}</div>
            <button
              type="button"
              onClick={() => router.push("/admin/brackets")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
            >
              Pick a match <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      ) : !matchId ? (
        <div className="flex-1 grid place-items-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-white/5 border border-white/10 p-6 text-center">
            <Trophy className="size-8 mx-auto text-amber-300" />
            <div className="mt-3 font-display text-lg font-semibold">
              No match selected
            </div>
            <div className="mt-1 text-sm text-white/80">
              Open AdminBrackets and tap the cage icon on a match to start
              scoring it cage-side.
            </div>
            <button
              type="button"
              onClick={() => router.push("/admin/brackets")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
            >
              Pick a match <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {completed ? (
            <div className="bg-emerald-700/30 border-b border-emerald-500/30 px-6 py-2 text-sm text-emerald-100 flex items-center gap-2">
              <CheckCircle2 className="size-4" /> Result recorded
              {match.resultMethod ? ` · ${match.resultMethod}` : ""}
              {match.resultRound ? ` · R${match.resultRound}` : ""}
              {match.resultTime ? ` · ${match.resultTime}` : ""}
            </div>
          ) : null}
          <div className="flex items-stretch flex-1 min-h-[60vh] flex-col md:flex-row">
            <FighterPanel
              side="left"
              color="bg-rose-700"
              entry={match?.entry1}
              fallbackName="Red corner — TBD"
              score={redScore}
              onScore={(d) => setRedScore((s) => Math.max(0, s + d))}
              isWinner={
                completed && match?.winnerEntryId && match?.entry1?.id === match.winnerEntryId
              }
            />
            <FighterPanel
              side="right"
              color="bg-sky-700"
              entry={match?.entry2}
              fallbackName="Blue corner — TBD"
              score={blueScore}
              onScore={(d) => setBlueScore((s) => Math.max(0, s + d))}
              isWinner={
                completed && match?.winnerEntryId && match?.entry2?.id === match.winnerEntryId
              }
            />
          </div>

          <div className="px-6 py-4 border-t border-white/10 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/60 font-semibold">
                Doctor / cuts notes
              </label>
              <textarea
                value={doctorNotes}
                onChange={(e) => { setDoctorNotes(e.target.value); setNotesDirty(true); }}
                rows={3}
                maxLength={4000}
                placeholder="Cuts, head impacts, medical clearance…"
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/15 text-sm p-2 text-white placeholder-white/30"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/60 font-semibold">
                Referee notes
              </label>
              <textarea
                value={refereeNotes}
                onChange={(e) => { setRefereeNotes(e.target.value); setNotesDirty(true); }}
                rows={3}
                maxLength={4000}
                placeholder="Warnings, point deductions, fouls…"
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/15 text-sm p-2 text-white placeholder-white/30"
              />
            </div>
            <div className="md:col-span-2 flex items-center justify-end gap-2">
              <span className="text-[11px] text-white/50">
                {notesDirty ? "Unsaved changes" : "Saved"}
              </span>
              <button
                type="button"
                onClick={saveNotes}
                disabled={savingNotes || !notesDirty}
                className="rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-40 px-3 py-1.5 text-sm flex items-center gap-2"
              >
                {savingNotes ? <Loader2 className="size-4 animate-spin" /> : null}
                Save notes
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-5 border-t border-white/10 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="text-[11px] uppercase tracking-wider text-white/60">
                Round
              </div>
              <div className="font-display text-3xl font-semibold tabular-nums">
                {round}
              </div>
              <button
                type="button"
                onClick={nextRound}
                className="ml-2 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-sm"
              >
                Next round
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="font-display text-5xl font-semibold tabular-nums">
                {time}
              </div>
              <button
                type="button"
                onClick={() => setRunning((v) => !v)}
                className="rounded-xl bg-white/15 hover:bg-white/25 px-4 py-2 flex items-center gap-2"
              >
                {running ? <Pause className="size-5" /> : <Play className="size-5" />}
                {running ? "Pause" : "Start"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 flex items-center gap-2 text-sm"
              >
                <RotateCcw className="size-4" /> Reset
              </button>
            </div>

            <button
              type="button"
              onClick={openResultDialog}
              disabled={completed}
              className="rounded-xl bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3 flex items-center gap-2 text-sm font-semibold"
            >
              <Trophy className="size-5" />
              {completed ? "Result already recorded" : "Submit result"}
            </button>
          </div>
        </div>
      )}

      {showResult ? (
        <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white text-foreground border border-border p-6 max-h-[92dvh] overflow-y-auto">
            <div className="font-display text-2xl font-semibold tracking-tight">
              Match result
            </div>
            <div className="mt-1 text-sm text-tertiary">
              Recording the winner advances them to the next round automatically.
            </div>

            <div className="mt-5 grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs uppercase tracking-wider text-tertiary font-semibold">
                  Winner
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWinnerSide("red")}
                    className={`rounded-xl px-4 py-3 text-sm font-semibold text-left ${
                      winnerSide === "red"
                        ? "bg-rose-600 text-white"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider opacity-80">
                      Red · {redScore}
                    </div>
                    <div className="truncate">
                      {match?.entry1?.participantName || "Red corner"}
                    </div>
                    <div className="text-[11px] opacity-80 truncate">
                      {clubLine(match?.entry1)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWinnerSide("blue")}
                    className={`rounded-xl px-4 py-3 text-sm font-semibold text-left ${
                      winnerSide === "blue"
                        ? "bg-sky-600 text-white"
                        : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider opacity-80">
                      Blue · {blueScore}
                    </div>
                    <div className="truncate">
                      {match?.entry2?.participantName || "Blue corner"}
                    </div>
                    <div className="text-[11px] opacity-80 truncate">
                      {clubLine(match?.entry2)}
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-tertiary font-semibold">
                  Method
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-2 w-full h-11 rounded-xl border border-border bg-background px-3"
                >
                  {RESULT_METHODS.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.code} · {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-tertiary font-semibold">
                  Round
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={resultRound}
                  onChange={(e) => setResultRound(Number(e.target.value))}
                  className="mt-2 w-full h-11 rounded-xl border border-border bg-background px-3"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs uppercase tracking-wider text-tertiary font-semibold">
                  Time (mm:ss)
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={resultTimeMin}
                    onChange={(e) => setResultTimeMin(Number(e.target.value))}
                    className="h-11 w-20 rounded-xl border border-border bg-background px-3"
                  />
                  <span>:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={resultTimeSec}
                    onChange={(e) => setResultTimeSec(Number(e.target.value))}
                    className="h-11 w-20 rounded-xl border border-border bg-background px-3"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResult(false)}
                disabled={submitting}
                className="rounded-xl border border-border bg-surface px-5 py-3 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitResult}
                disabled={submitting}
                className="rounded-xl bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {submitting ? "Submitting…" : "Submit & advance winner"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
