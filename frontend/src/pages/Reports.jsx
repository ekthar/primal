import { useEffect, useMemo, useState } from "react";
import { Download, Timer, AlertTriangle, Users, Gauge, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineLoadingLabel, SectionLoader } from "@/components/shared/PrimalLoader";
import { PageSectionHeader, ResponsivePageShell, ResponsiveTable } from "@/components/shared/ResponsivePrimitives";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [sla, setSla] = useState(null);
  const [workload, setWorkload] = useState([]);

  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [downloadingAllPdfs, setDownloadingAllPdfs] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantTotals, setParticipantTotals] = useState({
    approvedApplications: 0,
    clubParticipants: 0,
    individualParticipants: 0,
  });
  const [clubParticipants, setClubParticipants] = useState([]);
  const [individualParticipants, setIndividualParticipants] = useState([]);

  useEffect(() => {
    loadSummary();
    if (isAdmin) loadParticipantReport();
  }, [isAdmin]);

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

  async function loadParticipantReport() {
    setLoadingParticipants(true);
    const { data, error } = await api.reportParticipants();
    setLoadingParticipants(false);
    if (error) {
      toast.error(error.message || "Failed to load approved participant report");
      return;
    }

    setParticipantTotals(data?.totals || {
      approvedApplications: 0,
      clubParticipants: 0,
      individualParticipants: 0,
    });
    setClubParticipants(data?.clubParticipants || []);
    setIndividualParticipants(data?.individualParticipants || []);
  }

  async function handleApprovedExport() {
    const { error } = await api.downloadApprovedXlsx();
    if (error) {
      toast.error(error.message || "Failed to export approved applications");
      return;
    }
    toast.success("Approved applications export started");
  }

  async function handleParticipantsExport() {
    const { error } = await api.downloadApprovedParticipantsXlsx();
    if (error) {
      toast.error(error.message || "Failed to export approved participants");
      return;
    }
    toast.success("Approved participants export started");
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

  const filteredClubParticipants = useMemo(
    () => filterParticipantRows(clubParticipants, participantSearch),
    [clubParticipants, participantSearch]
  );

  const filteredIndividualParticipants = useMemo(
    () => filterParticipantRows(individualParticipants, participantSearch),
    [individualParticipants, participantSearch]
  );

  const allApprovedApplicationRows = useMemo(() => {
    const deduped = new Map();
    [...clubParticipants, ...individualParticipants].forEach((row) => {
      if (!row?.applicationId) return;
      if (!deduped.has(row.applicationId)) deduped.set(row.applicationId, row);
    });
    return Array.from(deduped.values());
  }, [clubParticipants, individualParticipants]);

  async function handleDownloadApplicationPdf(applicationId) {
    const { error } = await api.downloadApplicationPdf(applicationId);
    if (error) {
      toast.error(error.message || "Failed to download participant PDF");
      return;
    }
    toast.success("Participant PDF downloaded");
  }

  async function handleDownloadAllParticipantPdfs() {
    if (!allApprovedApplicationRows.length) {
      toast.error("No approved participants available for PDF download");
      return;
    }

    if (allApprovedApplicationRows.length > 250) {
      const ok = window.confirm(`This will download ${allApprovedApplicationRows.length} individual PDF files. Continue?`);
      if (!ok) return;
    }

    setDownloadingAllPdfs(true);
    let success = 0;
    let failed = 0;

    for (const row of allApprovedApplicationRows) {
      // Sequential downloads keep API load stable and avoid browser throttling bursts.
      const { error } = await api.downloadApplicationPdf(row.applicationId);
      if (error) failed += 1;
      else success += 1;
    }

    setDownloadingAllPdfs(false);
    if (failed) {
      toast.warning(`Downloaded ${success} PDFs, ${failed} failed`);
      return;
    }
    toast.success(`Downloaded ${success} approved participant PDFs`);
  }

  return (
    <ResponsivePageShell>
      <PageSectionHeader
        eyebrow="Reports"
        title="Review operations report"
        description="Live SLA, reviewer workload, and approved participant reports."
        actions={(
          <>
          <Button variant="outline" onClick={handleApprovedExport}>
            <Download className="size-4" /> Approved applications
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={handleParticipantsExport}>
              <Download className="size-4" /> Approved participants
            </Button>
          )}
          {isAdmin && (
            <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={handleAuditExport}>
              <Download className="size-4" /> Audit Excel
            </Button>
          )}
          </>
        )}
      />

      {loading ? (
        <div className="mt-8">
          <SectionLoader
            title="Loading live reports"
            description="Assembling SLA, reviewer throughput, and participant reporting data."
            cards={3}
            rows={5}
          />
        </div>
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

            <div className="mt-5 md:hidden space-y-3">
              {workload.map((reviewer) => (
                <div key={reviewer.id} className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="font-medium">{reviewer.name}</div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <DetailStat label="Open" value={reviewer.open} />
                    <DetailStat label="Approved" value={reviewer.approved7d} />
                    <DetailStat label="Rejected" value={reviewer.rejected7d} />
                  </div>
                </div>
              ))}
              {!workload.length && <div className="py-4 text-sm text-secondary-muted">No reviewer data found.</div>}
            </div>
            <ResponsiveTable className="hidden md:block">
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
            </ResponsiveTable>
          </div>

          {isAdmin && (
            <section className="mt-6 rounded-3xl border border-border bg-surface elev-card p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Approved participants report</h2>
                  <p className="text-sm text-secondary-muted mt-1">Club-wise and individual participant tables for approved applications.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" disabled={downloadingAllPdfs || loadingParticipants} onClick={handleDownloadAllParticipantPdfs}>
                    <InlineLoadingLabel loading={downloadingAllPdfs} loadingText="Downloading PDFs...">
                      <>
                        <Download className="size-4" /> Print/download all participant PDFs
                      </>
                    </InlineLoadingLabel>
                  </Button>
                  <Button variant="outline" size="sm" onClick={loadParticipantReport}>
                    <RefreshCcw className="size-4" /> Refresh participant report
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid sm:grid-cols-3 gap-3">
                <Kpi icon={Users} label="Approved applications" value={participantTotals.approvedApplications ?? 0} helper="Total approved rows" tone="default" />
                <Kpi icon={Users} label="Club participants" value={participantTotals.clubParticipants ?? 0} helper="Approved via clubs" tone="blue" />
                <Kpi icon={Users} label="Individual participants" value={participantTotals.individualParticipants ?? 0} helper="Approved without clubs" tone="emerald" />
              </div>

              <div className="mt-5 max-w-md">
                <Input
                  value={participantSearch}
                  onChange={(event) => setParticipantSearch(event.target.value)}
                  className="h-10 bg-background"
                  placeholder="Search name, club, discipline, tournament"
                />
              </div>

              {loadingParticipants ? (
                <div className="mt-5">
                  <SectionLoader
                    title="Loading participant report"
                    description="Splitting approved fighters into club and independent participant lists."
                    cards={2}
                    rows={4}
                    compact
                  />
                </div>
              ) : (
                <div className="mt-5 grid xl:grid-cols-2 gap-5">
                  <ParticipantTable
                    title="Club-wise participants"
                    rows={filteredClubParticipants}
                    showClub
                    onDownloadApplication={handleDownloadApplicationPdf}
                  />
                  <ParticipantTable
                    title="Individual participants"
                    rows={filteredIndividualParticipants}
                    showClub={false}
                    onDownloadApplication={handleDownloadApplicationPdf}
                  />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </ResponsivePageShell>
  );
}

function filterParticipantRows(rows, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const hay = [
      row.participantName,
      row.clubName,
      row.sex,
      row.discipline,
      row.tournamentName,
      row.applicationId,
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function ParticipantTable({ title, rows, showClub, onDownloadApplication }) {
  return (
    <div className="rounded-2xl border border-border bg-background/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-border font-medium text-sm">{title}</div>
      <div className="space-y-3 p-4 md:hidden">
        {rows.map((row) => (
          <article key={`${row.applicationId}-${row.profileId}`} className="rounded-2xl border border-border bg-surface p-4">
            <div className="font-medium">{row.participantName}</div>
            <div className="mt-1 text-[11px] text-tertiary">{row.tournamentName}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <DetailStat label="DOB" value={row.dateOfBirth || "-"} />
              <DetailStat label="Age" value={row.ageToday ?? "-"} />
              <DetailStat label="Sex" value={row.sex || "-"} />
              <DetailStat label="Discipline" value={row.discipline || "-"} />
              {showClub ? <DetailStat label="Club" value={row.clubName || "-"} /> : null}
            </div>
            <div className="mt-4">
              <Button variant="outline" size="sm" className="w-full" onClick={() => onDownloadApplication(row.applicationId)}>
                <Download className="size-3.5" /> PDF
              </Button>
            </div>
          </article>
        ))}
      </div>
      <ResponsiveTable className="hidden md:block">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">DOB</th>
              <th className="px-4 py-3">Age today</th>
              <th className="px-4 py-3">Sex</th>
              <th className="px-4 py-3">Discipline</th>
              {showClub && <th className="px-4 py-3">Club</th>}
              <th className="px-4 py-3 text-right">Print form</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.applicationId}-${row.profileId}`} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-sm">
                  <div className="font-medium">{row.participantName}</div>
                  <div className="text-[11px] text-tertiary mt-1">{row.tournamentName}</div>
                </td>
                <td className="px-4 py-3 text-sm">{row.dateOfBirth || "-"}</td>
                <td className="px-4 py-3 text-sm">{row.ageToday ?? "-"}</td>
                <td className="px-4 py-3 text-sm capitalize">{row.sex || "-"}</td>
                <td className="px-4 py-3 text-sm">{row.discipline || "-"}</td>
                {showClub && <td className="px-4 py-3 text-sm">{row.clubName || "-"}</td>}
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" size="sm" onClick={() => onDownloadApplication(row.applicationId)}>
                    <Download className="size-3.5" /> PDF
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ResponsiveTable>
      {!rows.length && <div className="px-4 py-4 text-sm text-secondary-muted">No rows found.</div>}
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

function DetailStat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</div>
      <div className="mt-1 text-sm capitalize">{value}</div>
    </div>
  );
}
