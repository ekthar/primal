import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Pause, Play, RotateCcw, Trophy } from "lucide-react";
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

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function FighterPanel({ name, setName, score, onScore, side, color }) {
  const align = side === "left" ? "items-start text-left" : "items-end text-right";
  return (
    <div className={`flex flex-col ${align} flex-1 px-6 py-8 ${color}`}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={side === "left" ? "Red corner" : "Blue corner"}
        className="bg-transparent border-b border-white/30 focus:border-white outline-none font-display text-3xl sm:text-5xl font-semibold tracking-tight w-full"
        style={{ textAlign: side === "left" ? "left" : "right" }}
      />
      <div className="mt-8 text-[12vw] sm:text-[10vw] lg:text-[8vw] font-display font-extrabold leading-none tabular-nums">
        {score}
      </div>
      <div className={`mt-6 flex gap-3 ${side === "right" ? "justify-end" : ""}`}>
        <button onClick={() => onScore(-1)} className="rounded-2xl bg-white/15 hover:bg-white/25 px-6 py-4 text-2xl font-semibold">−</button>
        <button onClick={() => onScore(1)} className="rounded-2xl bg-white/25 hover:bg-white/35 px-6 py-4 text-2xl font-semibold">+1</button>
        <button onClick={() => onScore(2)} className="rounded-2xl bg-white/25 hover:bg-white/35 px-6 py-4 text-2xl font-semibold">+2</button>
        <button onClick={() => onScore(3)} className="rounded-2xl bg-white/25 hover:bg-white/35 px-6 py-4 text-2xl font-semibold">+3</button>
      </div>
    </div>
  );
}

export default function CageScoreboard() {
  const router = useRouter();
  const matchId = (router.query?.match || "").toString();
  const [redName, setRedName] = useState("");
  const [blueName, setBlueName] = useState("");
  const [redScore, setRedScore] = useState(0);
  const [blueScore, setBlueScore] = useState(0);
  const [round, setRound] = useState(1);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [winner, setWinner] = useState("red");
  const [method, setMethod] = useState("DEC");
  const [resultRound, setResultRound] = useState(3);
  const [resultTimeMin, setResultTimeMin] = useState(5);
  const [resultTimeSec, setResultTimeSec] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const time = useMemo(() => fmt(seconds), [seconds]);

  function nextRound() {
    setRound((r) => r + 1);
    setSeconds(0);
    setRunning(false);
  }
  function reset() {
    setRedScore(0); setBlueScore(0); setRound(1); setSeconds(0); setRunning(false);
  }

  async function commitResult() {
    if (!matchId) {
      toast.success("Result captured locally (no match id provided in URL).");
      setShowResult(false);
      return;
    }
    setSubmitting(true);
    try {
      const time_str = `${String(resultTimeMin).padStart(2, "0")}:${String(resultTimeSec).padStart(2, "0")}`;
      const { error } = await api.submitMatchResult(matchId, {
        winnerSide: winner,
        method,
        round: resultRound,
        time: time_str,
        redScore,
        blueScore,
      });
      if (error) throw new Error(error.message || "Failed");
      toast.success("Result submitted");
      setShowResult(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="px-6 py-3 flex items-center justify-between border-b border-white/10">
        <div className="font-display text-xl tracking-tight font-semibold">Cage-side scoreboard</div>
        <div className="flex items-center gap-2 text-xs text-white/70">
          {matchId ? <span className="font-mono">match · {matchId.slice(0, 8)}</span> : <span>standalone</span>}
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        <div className="flex items-stretch flex-1 min-h-[60vh]">
          <FighterPanel
            name={redName} setName={setRedName} score={redScore}
            onScore={(d) => setRedScore((s) => Math.max(0, s + d))}
            side="left" color="bg-rose-700"
          />
          <FighterPanel
            name={blueName} setName={setBlueName} score={blueScore}
            onScore={(d) => setBlueScore((s) => Math.max(0, s + d))}
            side="right" color="bg-sky-700"
          />
        </div>

        <div className="flex items-center justify-between px-6 py-5 border-t border-white/10 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="text-[11px] uppercase tracking-wider text-white/60">Round</div>
            <div className="font-display text-3xl font-semibold tabular-nums">{round}</div>
            <button onClick={nextRound} className="ml-2 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5 text-sm">Next round</button>
          </div>

          <div className="flex items-center gap-3">
            <div className="font-display text-5xl font-semibold tabular-nums">{time}</div>
            <button onClick={() => setRunning((v) => !v)} className="rounded-xl bg-white/15 hover:bg-white/25 px-4 py-2 flex items-center gap-2">
              {running ? <Pause className="size-5" /> : <Play className="size-5" />}
              {running ? "Pause" : "Start"}
            </button>
            <button onClick={reset} className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 flex items-center gap-2 text-sm">
              <RotateCcw className="size-4" /> Reset
            </button>
          </div>

          <button
            onClick={() => setShowResult(true)}
            className="rounded-xl bg-amber-400 text-black hover:bg-amber-300 px-5 py-3 flex items-center gap-2 text-sm font-semibold"
          >
            <Trophy className="size-5" /> Submit result
          </button>
        </div>
      </div>

      {showResult ? (
        <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white text-foreground border border-border p-6">
            <div className="font-display text-2xl font-semibold tracking-tight">Match result</div>
            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-tertiary font-semibold">Winner</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button onClick={() => setWinner("red")} className={`rounded-xl px-4 py-3 text-sm font-semibold ${winner === "red" ? "bg-rose-600 text-white" : "bg-rose-100 text-rose-700"}`}>
                    {redName || "Red"}
                  </button>
                  <button onClick={() => setWinner("blue")} className={`rounded-xl px-4 py-3 text-sm font-semibold ${winner === "blue" ? "bg-sky-600 text-white" : "bg-sky-100 text-sky-700"}`}>
                    {blueName || "Blue"}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-tertiary font-semibold">Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-2 w-full h-11 rounded-xl border border-border bg-background px-3">
                  {RESULT_METHODS.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-tertiary font-semibold">Round</label>
                <input type="number" min={1} max={20} value={resultRound} onChange={(e) => setResultRound(Number(e.target.value))} className="mt-2 w-full h-11 rounded-xl border border-border bg-background px-3" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-tertiary font-semibold">Time (mm:ss)</label>
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" min={0} max={59} value={resultTimeMin} onChange={(e) => setResultTimeMin(Number(e.target.value))} className="h-11 w-20 rounded-xl border border-border bg-background px-3" />
                  <span>:</span>
                  <input type="number" min={0} max={59} value={resultTimeSec} onChange={(e) => setResultTimeSec(Number(e.target.value))} className="h-11 w-20 rounded-xl border border-border bg-background px-3" />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowResult(false)} className="rounded-xl border border-border bg-surface px-5 py-3 text-sm">Cancel</button>
              <button onClick={commitResult} disabled={submitting} className="rounded-xl bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold disabled:opacity-50">
                {submitting ? "Submitting…" : matchId ? "Submit" : "Capture (no match)"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
