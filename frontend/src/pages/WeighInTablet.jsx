import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, RefreshCcw, Scale, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

function fmtKg(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(2)} kg`;
}

export default function WeighInTablet() {
  const [tournaments, setTournaments] = useState([]);
  const [tournamentSlug, setTournamentSlug] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [participants, setParticipants] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(null);
  const [weightKg, setWeightKg] = useState("");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data } = await api.publicTournaments();
      const list = data?.tournaments || [];
      setTournaments(list);
      if (list[0]?.slug && !tournamentSlug) setTournamentSlug(list[0].slug);
    })();
  }, []);

  useEffect(() => {
    if (!tournamentSlug) return;
    setLoading(true);
    (async () => {
      const { data } = await api.publicTournamentBySlug(tournamentSlug);
      const t = data?.tournament;
      const id = t?.id || "";
      setTournamentId(id);
      setParticipants(data?.participants || []);
      if (id) {
        const r = await api.listWeighInsForTournament(id);
        setRecords(r?.data?.records || []);
      } else {
        setRecords([]);
      }
      setLoading(false);
    })();
  }, [tournamentSlug]);

  const recordsByApp = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      if (!map.has(r.applicationId) || new Date(r.weighedAt) > new Date(map.get(r.applicationId).weighedAt)) {
        map.set(r.applicationId, r);
      }
    }
    return map;
  }, [records]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) => {
      const name = `${p.first_name || ""} ${p.last_name || ""}`.toLowerCase();
      return name.includes(q) || (p.club_name || "").toLowerCase().includes(q) || (p.discipline || "").toLowerCase().includes(q);
    });
  }, [participants, filter]);

  function openParticipant(p) {
    setActive(p);
    setWeightKg(p.weight_kg ? String(p.weight_kg) : "");
    setNotes("");
    setPhotoFile(null);
    setPhotoPreview(null);
  }
  function closePanel() {
    setActive(null);
    setPhotoFile(null);
    setPhotoPreview(null);
  }
  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function submit() {
    const w = Number(weightKg);
    if (!w || w < 15 || w > 250) { toast.error("Enter a valid weight (15–250 kg)"); return; }
    if (!active?.application_id) { toast.error("Missing application id"); return; }
    setSubmitting(true);
    try {
      const { error } = await api.recordWeighIn({
        applicationId: active.application_id,
        weightKg: w,
        notes: notes || null,
        photoFile,
      });
      if (error) throw new Error(error.message || "Failed");
      toast.success(`Recorded ${w.toFixed(2)} kg`);
      const r = await api.listWeighInsForTournament(tournamentId);
      setRecords(r?.data?.records || []);
      closePanel();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Scale className="size-6 text-primary" />
            <div className="font-display text-2xl font-semibold tracking-tight">Weigh-in tablet</div>
          </div>
          <select
            value={tournamentSlug}
            onChange={(e) => setTournamentSlug(e.target.value)}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-base"
          >
            {tournaments.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </select>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search name / club / discipline…"
            className="h-11 flex-1 min-w-[200px] rounded-xl border border-border bg-surface px-4 text-base"
          />
          <button
            onClick={() => tournamentSlug && setTournamentSlug(tournamentSlug)}
            className="h-11 rounded-xl border border-border bg-surface px-4 text-sm flex items-center gap-2"
          >
            <RefreshCcw className="size-4" /> Refresh
          </button>
          <div className="text-sm text-secondary-muted">
            <span className="font-mono">{recordsByApp.size}</span>/<span className="font-mono">{participants.length}</span> weighed
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6">
        {loading ? (
          <div className="text-center py-12 text-secondary-muted">Loading…</div>
        ) : participants.length === 0 ? (
          <div className="text-center py-12 text-secondary-muted">No approved participants for this tournament yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const rec = recordsByApp.get(p.application_id);
              const done = !!rec;
              return (
                <button
                  key={p.application_id}
                  onClick={() => openParticipant(p)}
                  className={`text-left rounded-2xl border p-4 transition active:scale-[0.99] ${
                    done
                      ? "border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50"
                      : "border-border bg-surface hover:bg-surface-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-display text-lg font-semibold tracking-tight leading-tight">
                      {p.first_name} {p.last_name}
                    </div>
                    {done ? <CheckCircle2 className="size-5 text-emerald-600 shrink-0" /> : null}
                  </div>
                  <div className="mt-1 text-xs text-secondary-muted truncate">{p.club_name || "—"}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    {p.discipline ? <span className="rounded-full bg-surface-muted px-2 py-0.5">{p.discipline}</span> : null}
                    {p.weight_class ? <span className="rounded-full bg-surface-muted px-2 py-0.5">{p.weight_class}</span> : null}
                  </div>
                  <div className="mt-3 text-2xl font-display font-semibold tabular-nums">
                    {done ? fmtKg(rec.weightKg) : (p.weight_kg ? `~ ${fmtKg(p.weight_kg)}` : "—")}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {active ? (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-stretch">
          <div className="m-auto w-full max-w-4xl rounded-3xl bg-surface border border-border elev-card p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-wider text-tertiary font-semibold">Recording weigh-in</div>
                <div className="font-display text-3xl font-semibold tracking-tight mt-1">
                  {active.first_name} {active.last_name}
                </div>
                <div className="mt-1 text-sm text-secondary-muted">
                  {active.club_name || "—"} · {active.discipline || "—"} · {active.weight_class || "—"}
                </div>
              </div>
              <button onClick={closePanel} className="rounded-xl border border-border p-2 hover:bg-surface-muted">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-6 grid lg:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs uppercase tracking-wider text-tertiary font-semibold">Weight (kg)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="mt-2 w-full h-20 rounded-2xl border border-border bg-background px-5 text-5xl font-display font-semibold tabular-nums tracking-tight"
                  placeholder="0.00"
                  autoFocus
                />
                <label className="block mt-5 text-xs uppercase tracking-wider text-tertiary font-semibold">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2"
                  placeholder="Hydration check, late, etc."
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-tertiary font-semibold">Photo proof</label>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickFile} />
                <div className="mt-2 rounded-2xl border border-dashed border-border bg-surface-muted/30 aspect-[4/3] flex items-center justify-center overflow-hidden">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Weigh-in proof" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-secondary-muted text-sm">No photo</div>
                  )}
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-muted"
                >
                  <Camera className="size-4" /> Capture / upload photo
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={closePanel} className="rounded-xl border border-border bg-surface px-5 py-3 text-sm">Cancel</button>
              <button
                onClick={submit}
                disabled={submitting}
                className="rounded-xl bg-primary text-primary-foreground px-6 py-3 text-base font-semibold disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Record weigh-in"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
