import { useMemo, useState } from "react";
import { Download, Filter, Layers3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_REPORT,
  DISCIPLINE_DEFINITIONS,
  DISCIPLINE_SUMMARY,
} from "@/lib/tournamentWorkflow";

export default function Reports() {
  const [disciplineFilter, setDisciplineFilter] = useState("all");

  const categories = useMemo(() => {
    return disciplineFilter === "all"
      ? CATEGORY_REPORT
      : CATEGORY_REPORT.filter((category) => category.disciplineId === disciplineFilter);
  }, [disciplineFilter]);

  const summary = useMemo(() => {
    const source = disciplineFilter === "all"
      ? DISCIPLINE_SUMMARY
      : DISCIPLINE_SUMMARY.filter((discipline) => discipline.disciplineId === disciplineFilter);
    return source.reduce((acc, discipline) => {
      acc.approved += discipline.approvedCount;
      acc.pending += discipline.pendingCount;
      acc.rejected += discipline.rejectedCount;
      acc.ready += discipline.readyCategories;
      return acc;
    }, { approved: 0, pending: 0, rejected: 0, ready: 0 });
  }, [disciplineFilter]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Reports</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">Discipline-wise category report</h1>
          <p className="text-sm text-secondary-muted mt-2 max-w-3xl">
            Clean organizer reporting for category density, participant status, and bracket readiness.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Download className="size-4" /> CSV</Button>
          <Button className="bg-foreground text-background hover:bg-foreground/90"><Download className="size-4" /> PDF report</Button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDisciplineFilter("all")}
          className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-wider ${disciplineFilter === "all" ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-secondary-muted"}`}
        >
          All disciplines
        </button>
        {DISCIPLINE_DEFINITIONS.map((discipline) => (
          <button
            key={discipline.id}
            type="button"
            onClick={() => setDisciplineFilter(discipline.id)}
            className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-wider ${disciplineFilter === discipline.id ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-secondary-muted"}`}
          >
            {discipline.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Approved fighters" value={summary.approved} helper="Can feed bracket generation" tone="emerald" />
        <Kpi icon={Filter} label="Pending review" value={summary.pending} helper="Still in organizer queue" tone="amber" />
        <Kpi icon={Layers3} label="Rejected entries" value={summary.rejected} helper="Excluded from category density" tone="red" />
        <Kpi icon={Layers3} label="Ready for bracket" value={summary.ready} helper="Enough approved fighters" tone="blue" />
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-surface elev-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Category readiness status</h2>
            <p className="text-sm text-secondary-muted mt-1">Drill down from discipline to category to fighters.</p>
          </div>
          <div className="text-xs text-tertiary">{categories.length} categories shown</div>
        </div>

        <div className="mt-5 space-y-4">
          {categories.map((category) => (
            <article key={category.id} className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-display text-xl font-semibold tracking-tight">{category.label}</div>
                  <div className="text-sm text-secondary-muted mt-1">
                    {category.entries.map((entry) => entry.participantName).join(", ")}
                  </div>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                  category.readyForBracket
                    ? "bg-emerald-50 text-emerald-700"
                    : category.tooFewFighters
                      ? "bg-amber-50 text-amber-700"
                      : "bg-surface-muted text-secondary-muted"
                }`}>
                  {category.readyForBracket ? "Ready for bracket" : category.tooFewFighters ? "Too few fighters" : "Pending review"}
                </span>
              </div>

              <div className="grid sm:grid-cols-4 gap-3 mt-4">
                <Stat label="Participants" value={category.totalCount} />
                <Stat label="Approved" value={category.approvedCount} tone="emerald" />
                <Stat label="Pending" value={category.pendingCount} tone="amber" />
                <Stat label="Rejected" value={category.rejectedCount} tone="red" />
              </div>

              {category.invalidCount > 0 && (
                <div className="mt-4 rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50/60 dark:bg-orange-950/30 px-3 py-2 text-sm text-orange-800 dark:text-orange-200">
                  {category.invalidCount} entr{category.invalidCount === 1 ? "y is" : "ies are"} blocked for admin review before category lock.
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, helper, tone = "default" }) {
  const tones = {
    default: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="rounded-2xl border border-border bg-surface elev-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.14em] text-tertiary font-semibold">{label}</div>
        <Icon className="size-4 text-tertiary" />
      </div>
      <div className={`font-display text-3xl font-semibold tracking-tight mt-3 ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-secondary-muted mt-1">{helper}</div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }) {
  const tones = {
    default: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-4">
      <div className={`font-display text-2xl font-semibold tracking-tight ${tones[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold mt-1">{label}</div>
    </div>
  );
}
