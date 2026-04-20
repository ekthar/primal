import Link from "next/link";
import { ArrowRight, Layers3, ListChecks, Swords, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_REPORT,
  DISCIPLINE_SUMMARY,
  TOURNAMENT_OVERVIEW,
} from "@/lib/tournamentWorkflow";

export default function AdminOverview() {
  const overview = TOURNAMENT_OVERVIEW;
  const spotlightCategories = CATEGORY_REPORT.slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Tournament overview</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">Tournament workflow command center</h1>
          <p className="text-sm text-secondary-muted mt-2 max-w-3xl">
            Multi-discipline registration, discipline-wise category reporting, and bracket readiness in one organizer view.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/queue"><Button variant="outline"><ListChecks className="size-4" /> Review queue</Button></Link>
          <Link href="/admin/brackets"><Button className="bg-foreground text-background hover:bg-foreground/90"><Swords className="size-4" /> Bracket management</Button></Link>
        </div>
      </div>

      <div className="mt-8 grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi label="Participants" value={overview.totalParticipants} helper="Shared profiles" />
        <Kpi label="Competition entries" value={overview.totalEntries} helper="Discipline records" />
        <Kpi label="Approved fighters" value={overview.approvedEntries} helper="Ready for categories" tone="emerald" />
        <Kpi label="Pending review" value={overview.pendingEntries} helper="Organizer queue" tone="amber" />
        <Kpi label="Ready for bracket" value={overview.readyCategories} helper="Categories cleared" tone="blue" />
      </div>

      <div className="mt-6 grid lg:grid-cols-[1.2fr_0.8fr] gap-5">
        <section className="rounded-3xl border border-border bg-surface elev-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Discipline-wise category report</h2>
              <p className="text-sm text-secondary-muted mt-1">Counts, readiness, and drill-down momentum per discipline.</p>
            </div>
            <Link href="/admin/reports" className="text-sm font-medium inline-flex items-center gap-1 text-foreground">
              Open full report <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="mt-5 grid md:grid-cols-2 gap-3">
            {DISCIPLINE_SUMMARY.map((discipline) => (
              <article key={discipline.disciplineId} className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{discipline.disciplineLabel}</div>
                    <div className="text-xs text-secondary-muted mt-1">{discipline.entryCount} entries mapped into categories</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{discipline.readyCategories} ready</span>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                  <MiniStat label="Approved" value={discipline.approvedCount} tone="emerald" />
                  <MiniStat label="Pending" value={discipline.pendingCount} tone="amber" />
                  <MiniStat label="Rejected" value={discipline.rejectedCount} tone="red" />
                  <MiniStat label="Thin" value={discipline.insufficientCategories} tone="slate" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-surface elev-card p-6">
          <div className="flex items-center gap-2">
            <Layers3 className="size-5 text-primary" />
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Ready for bracket shortlist</h2>
              <p className="text-sm text-secondary-muted mt-1">Categories with enough approved fighters to generate pairings now.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {overview.bracketShortlist.map((category) => (
              <div key={category.id} className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="font-medium">{category.label}</div>
                <div className="text-sm text-secondary-muted mt-1">
                  {category.approvedCount} approved · {category.pendingCount} pending · {category.tooFewFighters ? "Useful but still light" : "Good density for seeding"}
                </div>
              </div>
            ))}
            {overview.bracketShortlist.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-background/50 p-5 text-sm text-secondary-muted">
                No categories are ready for bracket yet.
              </div>
            )}
          </div>
          <div className="mt-5 rounded-2xl border border-border bg-background/60 p-4 flex items-start gap-3">
            <TimerReset className="size-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-secondary-muted">
              Brackets are generated only from approved fighters, per discipline and category. Non-power-of-two counts receive byes automatically.
            </p>
          </div>
        </section>
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-surface elev-card p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Category readiness snapshot</h2>
            <p className="text-sm text-secondary-muted mt-1">Quick drill-down into the categories most likely to move next.</p>
          </div>
          <Link href="/admin/reports"><Button variant="outline">Open organizer report</Button></Link>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                <th className="py-3">Category</th>
                <th className="py-3">Approved</th>
                <th className="py-3">Pending</th>
                <th className="py-3">Rejected</th>
                <th className="py-3">Bracket status</th>
              </tr>
            </thead>
            <tbody>
              {spotlightCategories.map((category) => (
                <tr key={category.id} className="border-b border-border last:border-b-0">
                  <td className="py-3 text-sm">{category.label}</td>
                  <td className="py-3 text-sm">{category.approvedCount}</td>
                  <td className="py-3 text-sm">{category.pendingCount}</td>
                  <td className="py-3 text-sm">{category.rejectedCount}</td>
                  <td className="py-3 text-sm">
                    {category.readyForBracket ? "Ready for bracket" : category.tooFewFighters ? "Too few fighters" : "Waiting on approvals"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, helper, tone = "default" }) {
  const tones = {
    default: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    blue: "text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="rounded-2xl border border-border bg-surface elev-card p-5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-tertiary font-semibold">{label}</div>
      <div className={`font-display text-3xl font-semibold tracking-tight mt-3 ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-secondary-muted mt-1">{helper}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    slate: "text-secondary-muted",
  };
  return (
    <div className="rounded-xl border border-border bg-surface px-2 py-3">
      <div className={`font-display text-xl font-semibold tracking-tight ${tones[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold mt-1">{label}</div>
    </div>
  );
}
