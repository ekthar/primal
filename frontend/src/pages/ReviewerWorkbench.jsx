import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  CheckCircle2,
  ChevronRight,
  FileWarning,
  Search,
  ShieldCheck,
  Swords,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import EntryStatusPill from "@/components/tournament/EntryStatusPill";
import EmptyState from "@/components/shared/EmptyState";
import {
  ENTRY_STATUS,
  TOURNAMENT_ENTRIES,
  findParticipantById,
} from "@/lib/tournamentWorkflow";

export default function ReviewerWorkbench() {
  const router = useRouter();
  const routeId = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;
  const [entries, setEntries] = useState(TOURNAMENT_ENTRIES);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(routeId || TOURNAMENT_ENTRIES[0]?.id);

  useEffect(() => {
    if (routeId) setActiveId(routeId);
  }, [routeId]);

  const queue = useMemo(() => {
    const needle = search.toLowerCase();
    return entries.filter((entry) => {
      if (![ENTRY_STATUS.PENDING, ENTRY_STATUS.APPROVED].includes(entry.reviewStatus)) return false;
      if (!needle) return true;
      return [entry.participantName, entry.club, entry.disciplineLabel, entry.id].some((value) => value.toLowerCase().includes(needle));
    });
  }, [entries, search]);

  const activeEntry = useMemo(() => entries.find((entry) => entry.id === activeId), [activeId, entries]);
  const participant = activeEntry ? findParticipantById(activeEntry.participantId) : null;

  const updateStatus = (status) => {
    setEntries((current) => current.map((entry) => (
      entry.id === activeId ? { ...entry, reviewStatus: status } : entry
    )));
  };

  if (!activeEntry || !participant) {
    return (
      <div className="p-10">
        <EmptyState icon={Search} title="No discipline entry selected" description="Choose a competition entry from the queue to review it." />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen">
      <aside className="hidden lg:flex w-[340px] shrink-0 flex-col border-r border-border bg-surface/40">
        <div className="p-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Participant review</div>
          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-tertiary" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8 h-9 bg-surface" placeholder="Search queue" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {queue.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setActiveId(entry.id);
                router.replace(`/admin/review/${entry.id}`);
              }}
              className={`w-full text-left border-b border-border px-4 py-3 transition-colors ${entry.id === activeId ? "bg-surface-muted border-l-2 border-l-primary" : "hover:bg-surface-muted/50 border-l-2 border-l-transparent"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{entry.participantName}</div>
                  <div className="text-[11px] text-tertiary mt-1 truncate">{entry.disciplineLabel} · {entry.weightClassLabel}</div>
                </div>
                <EntryStatusPill status={entry.reviewStatus} size="xs" />
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="px-6 py-5 flex items-center gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-tertiary">
                <span className="font-mono">{activeEntry.id}</span>
                <ChevronRight className="size-3" />
                <span>{activeEntry.disciplineLabel}</span>
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight mt-1">{activeEntry.participantName}</h2>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <EntryStatusPill status={activeEntry.reviewStatus} />
                <span className="text-xs text-tertiary">{activeEntry.categoryLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => updateStatus(ENTRY_STATUS.REJECTED)}>
                <XCircle className="size-4 mr-1.5" /> Reject
              </Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus(ENTRY_STATUS.APPROVED)}>
                <CheckCircle2 className="size-4 mr-1.5" /> Approve
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight">Discipline entry</h3>
              <Separator className="my-4" />
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <Detail label="Discipline" value={activeEntry.disciplineLabel} />
                <Detail label="Category" value={activeEntry.categoryLabel} />
                <Detail label="Age group" value={activeEntry.ageGroupLabel} />
                <Detail label="Weight class" value={activeEntry.weightClassLabel} />
                <Detail label="Gender" value={activeEntry.gender === "male" ? "Male" : "Female"} />
                <Detail label="Experience" value={activeEntry.experienceLabel} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-start gap-3">
                <Swords className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-xl font-semibold tracking-tight">Bracket readiness</h3>
                  <p className="text-sm text-secondary-muted mt-2">
                    This entry contributes to a bracket only after approval. Category grouping uses discipline, age, gender, weight, and experience level.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight">Participant details</h3>
              <Separator className="my-4" />
              <div className="space-y-3 text-sm">
                <Detail label="Club" value={participant.club} />
                <Detail label="Nationality" value={participant.nationality} />
                <Detail label="Weight" value={`${participant.weight} kg`} />
                <Detail label="Payment" value={participant.paymentStatus} />
                <Detail label="Documents" value={participant.documentsStatus} />
                <Detail label="Waiver" value={participant.waiverStatus} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight">Auto checks</h3>
              <Separator className="my-4" />
              <div className="space-y-3 text-sm">
                <CheckRow ok={activeEntry.issues.length === 0} label="Entry maps cleanly into a valid category" />
                <CheckRow ok={participant.documentsStatus === "complete"} label="Documents complete" />
                <CheckRow ok={participant.paymentStatus === "paid"} label="Payment cleared" />
                <CheckRow ok={participant.waiverStatus === "signed"} label="Waiver signed" />
              </div>
              {activeEntry.issues.length > 0 && (
                <div className="mt-4 rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50/60 dark:bg-orange-950/30 p-3 text-sm text-orange-800 dark:text-orange-200">
                  {activeEntry.issues.join(" ")}
                </div>
              )}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function CheckRow({ ok, label }) {
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <ShieldCheck className="size-4 text-emerald-500 shrink-0 mt-0.5" />
      ) : (
        <FileWarning className="size-4 text-orange-500 shrink-0 mt-0.5" />
      )}
      <span className={ok ? "" : "text-orange-700 dark:text-orange-300"}>{label}</span>
    </div>
  );
}
