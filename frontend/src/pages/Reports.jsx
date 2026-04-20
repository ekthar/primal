import { useEffect, useMemo, useState } from "react";
import { Download, Timer, AlertTriangle, Users, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Reports() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sla, setSla] = useState(null);
  const [workload, setWorkload] = useState([]);

  useEffect(() => {
    loadSummary();
  }, []);

  async function loadSummary() {
    setLoading(true);
    const { data, error } = await api.reportSummary();
    setLoading(false);
    if (error) {
      toast.error(error.message || "Failed to load reports summary");
      return;
    }
    setSla(data.sla || null);
    setWorkload(data.workload || []);
  }

  async function handleApprovedExport() {
    const { error } = await api.downloadApprovedXlsx();
    if (error) {
      toast.error(error.message || "Failed to export approved applications");
      return;
    }
    toast.success("Approved applications export started");
  }

  async function handleAuditExport() {
    const { error } = await api.downloadAuditXlsx();
    if (error) {
      toast.error(error.message || "Failed to export audit report");
      return;
    }
    toast.success("Audit export started");
  }

  const queueHealth = useMemo(() => {
    if (!sla) return "-";
    if (Number(sla.overdue || 0) === 0) return "Healthy";
    if (Number(sla.overdue || 0) <= 3) return "Watch";
    return "At risk";
  }, [sla]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Reports</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">Review operations report</h1>
          <p className="text-sm text-secondary-muted mt-2 max-w-3xl">
            Live SLA and reviewer workload telemetry from the production API.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleApprovedExport}>
            <Download className="size-4" /> Approved Excel
          </Button>
          {user?.role === "admin" && (
            <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={handleAuditExport}>
              <Download className="size-4" /> Audit Excel
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-secondary-muted">Loading live report data...</div>
      ) : (
        <>
      <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi icon={Users} label="Open queue" value={sla?.openTotal ?? 0} helper="Submitted + under review" tone="default" />
        <Kpi icon={AlertTriangle} label="Overdue" value={sla?.overdue ?? 0} helper="SLA breaches" tone="red" />
        <Kpi icon={Timer} label="Due soon" value={sla?.dueSoon ?? 0} helper="Within next 6 hours" tone="amber" />
        <Kpi icon={AlertTriangle} label="Correction overdue" value={sla?.correctionOverdue ?? 0} helper="Correction windows expired" tone="red" />
        <Kpi icon={Gauge} label="Queue health" value={queueHealth} helper="Operational status" tone={queueHealth === "Healthy" ? "emerald" : queueHealth === "Watch" ? "amber" : "red"} />
      </div>

      <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-2 gap-3">
        <Kpi icon={Timer} label="Avg first review (30d)" value={sla?.avgFirstReviewHours30d ?? "-"} helper="Hours from submit to review start" tone="blue" />
        <Kpi icon={Timer} label="Avg review cycle (30d)" value={sla?.avgReviewHours30d ?? "-"} helper="Hours from submit to decision" tone="blue" />
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-surface elev-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Reviewer workload</h2>
            <p className="text-sm text-secondary-muted mt-1">Open queue allocation and recent outcomes by reviewer.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadSummary}>Refresh</Button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                <th className="py-3">Reviewer</th>
                <th className="py-3">Open</th>
                <th className="py-3">Approved (7d)</th>
                <th className="py-3">Rejected (7d)</th>
              </tr>
            </thead>
            <tbody>
              {workload.map((reviewer) => (
                <tr key={reviewer.id} className="border-b border-border last:border-b-0">
                  <td className="py-3 text-sm font-medium">{reviewer.name}</td>
                  <td className="py-3 text-sm">{reviewer.open}</td>
                  <td className="py-3 text-sm">{reviewer.approved7d}</td>
                  <td className="py-3 text-sm">{reviewer.rejected7d}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!workload.length && <div className="py-4 text-sm text-secondary-muted">No reviewer data found.</div>}
        </div>
      </div>
        </>
      )}
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
