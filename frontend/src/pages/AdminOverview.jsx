import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Layers3, ListChecks, TimerReset, RefreshCcw, Download, Scale, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineLoadingLabel, SectionLoader } from "@/components/shared/PrimalLoader";
import api from "@/lib/api";
import { toast } from "sonner";
import { useLocale } from "@/context/LocaleContext";

export default function AdminOverview() {
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [sla, setSla] = useState(null);
  const [workload, setWorkload] = useState([]);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);
    const [summaryRes, queueRes] = await Promise.all([
      api.reportSummary(),
      api.queueBoard({ status: "all", limit: 50, offset: 0 }),
    ]);
    setLoading(false);

    if (summaryRes.error) {
      toast.error(summaryRes.error.message || "Failed to load report summary");
      return;
    }
    if (queueRes.error) {
      toast.error(queueRes.error.message || "Failed to load queue stats");
      return;
    }

    setSla(summaryRes.data?.sla || null);
    setWorkload(summaryRes.data?.workload || []);
    setCounts(queueRes.data?.counts || {});
  }

  async function handleApprovedParticipantsExport() {
    const { error } = await api.downloadApprovedParticipantsXlsx();
    if (error) {
      toast.error(error.message || "Failed to export approved participants");
      return;
    }
    toast.success("Approved participants export started");
  }

  const totalApplications = useMemo(() => Object.values(counts || {}).reduce((sum, n) => sum + Number(n || 0), 0), [counts]);
  const isBootLoading = loading && !sla && !workload.length && !Object.keys(counts || {}).length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{locale?.t("adminOverview.eyebrow", "Tournament overview") ?? "Tournament overview"}</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">{locale?.t("adminOverview.heading", "Tournament workflow command center") ?? "Tournament workflow command center"}</h1>
          <p className="text-sm text-secondary-muted mt-2 max-w-3xl">
            {locale?.t("adminOverview.description", "Live registration and review telemetry for operations, assignment load, and SLA risk.") ?? "Live registration and review telemetry for operations, assignment load, and SLA risk."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/queue"><Button variant="outline"><ListChecks className="size-4" /> {locale?.t("nav.queue", "Review queue") ?? "Review queue"}</Button></Link>
          <Link href="/admin/weighin"><Button variant="outline"><Scale className="size-4" /> {locale?.t("adminOverview.weighInUpdates", "Weigh-in updates") ?? "Weigh-in updates"}</Button></Link>
          <Link href="/admin/settings"><Button variant="outline"><SlidersHorizontal className="size-4" /> {locale?.t("adminOverview.tournamentSettings", "Tournament settings") ?? "Tournament settings"}</Button></Link>
          <Button variant="outline" onClick={handleApprovedParticipantsExport}><Download className="size-4" /> {locale?.t("adminOverview.approvedParticipants", "Approved participants") ?? "Approved participants"}</Button>
          <Button variant="outline" onClick={loadOverview}>
            <InlineLoadingLabel loading={loading} loadingText={locale?.t("adminOverview.refreshing", "Refreshing...") ?? "Refreshing..."}>
              <>
                <RefreshCcw className="size-4" /> {locale?.t("actions.refresh", "Refresh") ?? "Refresh"}
              </>
            </InlineLoadingLabel>
          </Button>
        </div>
      </div>

      {isBootLoading ? (
        <div className="mt-8">
          <SectionLoader
            title="Loading command center"
            description="Assembling queue counts, reviewer load, and SLA telemetry for Primal operations."
            cards={5}
            rows={5}
          />
        </div>
      ) : (
        <>
      <div className="mt-8 grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi label={locale?.t("adminOverview.kpi.applications", "Applications") ?? "Applications"} value={loading ? "-" : totalApplications} helper={locale?.t("adminOverview.kpi.applicationsHelper", "All workflow states") ?? "All workflow states"} />
        <Kpi label={locale?.t("adminOverview.kpi.openQueue", "Open queue") ?? "Open queue"} value={loading ? "-" : sla?.openTotal ?? 0} helper={locale?.t("adminOverview.kpi.openQueueHelper", "Submitted + under review") ?? "Submitted + under review"} tone="amber" />
        <Kpi label={locale?.t("status.approved", "Approved") ?? "Approved"} value={loading ? "-" : counts.approved ?? 0} helper={locale?.t("adminOverview.kpi.approvedHelper", "Finalized approvals") ?? "Finalized approvals"} tone="emerald" />
        <Kpi label={locale?.t("status.rejected", "Rejected") ?? "Rejected"} value={loading ? "-" : counts.rejected ?? 0} helper={locale?.t("adminOverview.kpi.rejectedHelper", "Finalized rejections") ?? "Finalized rejections"} tone="blue" />
        <Kpi label={locale?.t("adminOverview.kpi.overdueSla", "Overdue SLA") ?? "Overdue SLA"} value={loading ? "-" : sla?.overdue ?? 0} helper={locale?.t("adminOverview.kpi.overdueSlaHelper", "Needs immediate action") ?? "Needs immediate action"} tone="amber" />
      </div>

      <div className="mt-6 grid lg:grid-cols-[1.2fr_0.8fr] gap-5">
        <section className="rounded-3xl border border-border bg-surface elev-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{locale?.t("adminOverview.queueDistribution", "Queue distribution") ?? "Queue distribution"}</h2>
              <p className="text-sm text-secondary-muted mt-1">{locale?.t("adminOverview.queueDistributionHelper", "Current volume by workflow status.") ?? "Current volume by workflow status."}</p>
            </div>
            <Link href="/admin/reports" className="text-sm font-medium inline-flex items-center gap-1 text-foreground">
              {locale?.t("adminOverview.openFullReport", "Open full report") ?? "Open full report"} <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                  <th className="py-3">{locale?.t("fields.status", "Status") ?? "Status"}</th>
                  <th className="py-3">{locale?.t("adminOverview.count", "Count") ?? "Count"}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(counts || {}).map(([status, value]) => (
                  <tr key={status} className="border-b border-border last:border-b-0">
                    <td className="py-3 text-sm capitalize">{status.replace(/_/g, " ")}</td>
                    <td className="py-3 text-sm">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!Object.keys(counts || {}).length && <div className="py-4 text-sm text-secondary-muted">No queue distribution available.</div>}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-surface elev-card p-6">
          <div className="flex items-center gap-2">
            <Layers3 className="size-5 text-primary" />
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{locale?.t("adminOverview.reviewerLoad", "Reviewer load") ?? "Reviewer load"}</h2>
              <p className="text-sm text-secondary-muted mt-1">{locale?.t("adminOverview.reviewerLoadHelper", "Who is carrying open queue and recent decisions.") ?? "Who is carrying open queue and recent decisions."}</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {workload.map((reviewer) => (
              <div key={reviewer.id} className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="font-medium">{reviewer.name}</div>
                <div className="text-sm text-secondary-muted mt-1">
                  {reviewer.open} open · {reviewer.approved7d} approved (7d) · {reviewer.rejected7d} rejected (7d)
                </div>
              </div>
            ))}
            {!workload.length && (
              <div className="rounded-2xl border border-dashed border-border bg-background/50 p-5 text-sm text-secondary-muted">
                No reviewer workload data available.
              </div>
            )}
          </div>
          <div className="mt-5 rounded-2xl border border-border bg-background/60 p-4 flex items-start gap-3">
            <TimerReset className="size-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-secondary-muted">
              SLA risk grows when submitted and under-review counts rise while overdue remains non-zero.
            </p>
          </div>
        </section>
      </div>

      <div className="mt-6 grid md:grid-cols-2 gap-5">
        <Link href="/admin/weighin" className="rounded-3xl border border-border bg-surface elev-card p-6 block hover:bg-surface-muted/40 transition-colors">
          <div className="flex items-start gap-3">
            <Scale className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Participant weigh-in updates</h2>
              <p className="text-sm text-secondary-muted mt-2">
                Update match-day weight for all participants, club by club, and refresh weight class automatically for grouping.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/admin/settings" className="rounded-3xl border border-border bg-surface elev-card p-6 block hover:bg-surface-muted/40 transition-colors">
          <div className="flex items-start gap-3">
            <SlidersHorizontal className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Tournament registration settings</h2>
              <p className="text-sm text-secondary-muted mt-2">
                Control registration open/close dates, correction window duration, and event visibility from one place.
              </p>
            </div>
          </div>
        </Link>
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-surface elev-card p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Operational SLA snapshot</h2>
            <p className="text-sm text-secondary-muted mt-1">Critical queue timings used by reviewer leads.</p>
          </div>
          <Link href="/admin/reports"><Button variant="outline">Open organizer report</Button></Link>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                <th className="py-3">Metric</th>
                <th className="py-3">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border"><td className="py-3 text-sm">Open total</td><td className="py-3 text-sm">{sla?.openTotal ?? "-"}</td></tr>
              <tr className="border-b border-border"><td className="py-3 text-sm">Overdue</td><td className="py-3 text-sm">{sla?.overdue ?? "-"}</td></tr>
              <tr className="border-b border-border"><td className="py-3 text-sm">Due soon (6h)</td><td className="py-3 text-sm">{sla?.dueSoon ?? "-"}</td></tr>
              <tr className="border-b border-border"><td className="py-3 text-sm">Correction overdue</td><td className="py-3 text-sm">{sla?.correctionOverdue ?? "-"}</td></tr>
              <tr className="border-b border-border"><td className="py-3 text-sm">Avg first review (30d)</td><td className="py-3 text-sm">{sla?.avgFirstReviewHours30d ?? "-"}</td></tr>
              <tr><td className="py-3 text-sm">Avg cycle (30d)</td><td className="py-3 text-sm">{sla?.avgReviewHours30d ?? "-"}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
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
