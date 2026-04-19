import { Download, TrendingUp, Percent, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REPORT_METRICS } from "@/lib/mockData";
import { toast } from "sonner";

export default function Reports() {
  const m = REPORT_METRICS;
  const maxSubmitted = Math.max(...m.byWeek.map((w) => w.submitted));
  const maxDiscipline = Math.max(...m.byDiscipline.map((d) => d.count));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Reports</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">Season insights</h1>
          <p className="text-sm text-secondary-muted mt-1">Live sanctioning metrics for Season 2026 · aggregated across all clubs.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="report-export-csv" onClick={() => toast.success("Export queued — you'll receive it by email")}>
            <Download className="size-4" /> CSV
          </Button>
          <Button className="bg-foreground text-background hover:bg-foreground/90" data-testid="report-export-pdf" onClick={() => toast.success("PDF report generated")}>
            <Download className="size-4" /> PDF report
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={TrendingUp} label="Total applications" value={m.totalApplications} tone="foreground" />
        <Kpi icon={Percent} label="Approved rate" value={`${Math.round(m.approvedRate * 100)}%`} tone="emerald" />
        <Kpi icon={Clock} label="Avg. review time" value={`${m.avgReviewHours} h`} tone="blue" />
        <Kpi icon={AlertTriangle} label="Correction rate" value={`${Math.round(m.correctionRate * 100)}%`} tone="orange" />
      </div>

      {/* Charts */}
      <div className="mt-6 grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight">Submissions vs approvals</h2>
              <p className="text-xs text-tertiary mt-0.5">Last 7 weeks</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <LegendDot color="bg-foreground" label="Submitted" />
              <LegendDot color="bg-emerald-500" label="Approved" />
            </div>
          </div>
          <div className="mt-6 flex items-end gap-3 h-48">
            {m.byWeek.map((w) => (
              <div key={w.w} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full h-full flex items-end gap-1 justify-center">
                  <div
                    className="w-full bg-foreground rounded-t transition-all duration-500 ease-ios"
                    style={{ height: `${(w.submitted / maxSubmitted) * 100}%` }}
                    title={`Submitted: ${w.submitted}`}
                  />
                  <div
                    className="w-full bg-emerald-500 rounded-t transition-all duration-500 ease-ios"
                    style={{ height: `${(w.approved / maxSubmitted) * 100}%` }}
                    title={`Approved: ${w.approved}`}
                  />
                </div>
                <span className="text-[10px] font-mono text-tertiary">{w.w}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">By discipline</h2>
          <p className="text-xs text-tertiary mt-0.5">Share of total applications</p>
          <ul className="mt-5 space-y-3">
            {m.byDiscipline.map((d) => (
              <li key={d.d}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{d.d}</span>
                  <span className="font-mono tabular-nums text-tertiary text-xs">{d.count}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                  <div className="h-full bg-foreground rounded-full transition-all duration-700 ease-ios" style={{ width: `${(d.count / maxDiscipline) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone = "foreground" }) {
  const tones = {
    foreground: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
    orange: "text-orange-600 dark:text-orange-400",
  };
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-tertiary font-semibold">{label}</span>
        <Icon className="size-4 text-tertiary" strokeWidth={1.75} />
      </div>
      <div className={`mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-secondary-muted">
      <span className={`size-2 rounded-full ${color}`} /> {label}
    </span>
  );
}
