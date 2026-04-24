import { useEffect, useMemo, useState } from "react";
import { Download, Timer, AlertTriangle, Users, Gauge, RefreshCcw, ShieldCheck, QrCode, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineLoadingLabel, SectionLoader } from "@/components/shared/PrimalLoader";
import { PageSectionHeader, ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [sla, setSla] = useState(null);
  const [workload, setWorkload] = useState([]);
  const [production, setProduction] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState("");

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
    if (isAdmin) {
      loadParticipantReport();
      loadAnalytics("");
      loadTournaments();
    }
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
    setProduction(data.production || null);
  }

  async function loadTournaments() {
    const { data, error } = await api.adminTournaments({ includeArchived: true });
    if (error) {
      toast.error(error.message || "Failed to load tournaments");
      return;
    }
    setTournaments(data?.tournaments || []);
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

  async function loadAnalytics(tournamentIdOverride) {
    setLoadingAnalytics(true);
    const tournamentId = tournamentIdOverride !== undefined ? tournamentIdOverride : selectedTournamentId;
    const { data, error } = await api.reportAnalytics({
      tournamentId: tournamentId || undefined,
      discipline: selectedDiscipline || undefined,
    });
    setLoadingAnalytics(false);
    if (error) {
      toast.error(error.message || "Failed to load grouped analytics");
      return;
    }
    setAnalytics(data);
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

  async function handleAnalyticsExport() {
    const { error } = await api.downloadApplicationAnalyticsXlsx({
      tournamentId: selectedTournamentId || undefined,
      discipline: selectedDiscipline || undefined,
    });
    if (error) {
      toast.error(error.message || "Failed to export grouped analytics");
      return;
    }
    toast.success("Grouped analytics export started");
  }

  async function handleAnalyticsPdfExport() {
    const { error } = await api.downloadApplicationAnalyticsPdf({
      tournamentId: selectedTournamentId || undefined,
      discipline: selectedDiscipline || undefined,
    });
    if (error) {
      toast.error(error.message || "Failed to export grouped analytics PDF");
      return;
    }
    toast.success("Grouped analytics PDF export started");
  }

  async function handleSeasonReportPdf(tournamentId = selectedTournamentId) {
    if (!tournamentId) {
      toast.error("Select a tournament first");
      return;
    }
    const { error } = await api.downloadSeasonReportPdf(tournamentId);
    if (error) {
      toast.error(error.message || "Failed to export season report");
      return;
    }
    toast.success("Season report PDF export started");
  }

  async function handleParticipantsPdfExport() {
    const { error } = await api.downloadApprovedParticipantsPdf(
      selectedTournamentId ? { tournamentId: selectedTournamentId } : undefined,
    );
    if (error) {
      toast.error(error.message || "Failed to export participant roster PDF");
      return;
    }
    toast.success("Participant roster PDF export started");
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
  const selectedTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedTournamentId) || null,
    [selectedTournamentId, tournaments]
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

    setDownloadingAllPdfs(true);
    // Server-side streams a single ZIP bundle of every approved PDF plus a
    // human-readable manifest, replacing the old sequential per-row loop.
    const { error } = await api.downloadApprovedParticipantsZip(
      selectedTournamentId ? { tournamentId: selectedTournamentId } : undefined,
    );
    setDownloadingAllPdfs(false);
    if (error) {
      toast.error(error.message || "Failed to download participant bundle");
      return;
    }
    toast.success(`Downloaded bundle of ${allApprovedApplicationRows.length} approved participants`);
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
              <Download className="size-4" /> Approved participants (XLSX)
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={handleParticipantsPdfExport}>
              <Download className="size-4" /> Approved participants (PDF)
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" onClick={handleAnalyticsPdfExport}>
                <Download className="size-4" /> Analytics PDF
              </Button>
              <Button variant="outline" onClick={handleAnalyticsExport}>
                <Download className="size-4" /> Analytics Excel
              </Button>
            </>
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
            <div className="hidden md:block overflow-x-auto">
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

          {isAdmin && (
            <section className="mt-6 rounded-3xl border border-border bg-surface elev-card p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Production readiness</h2>
                  <p className="text-sm text-secondary-muted mt-1">Deploy configuration, notification health, export activity, and QR verification telemetry.</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadSummary}>
                  <RefreshCcw className="size-4" /> Refresh diagnostics
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Kpi icon={ShieldCheck} label="Readiness" value={production?.readiness?.ok ? "Ready" : "Needs work"} helper="Critical production checks" tone={production?.readiness?.ok ? "emerald" : "amber"} />
                <Kpi icon={MailWarning} label="Email failures" value={production?.notifications?.recentFailures?.length ?? 0} helper="Most recent failed sends" tone={production?.notifications?.recentFailures?.length ? "red" : "emerald"} />
                <Kpi icon={Download} label="PDF exports (7d)" value={production?.audit?.exportsLast7d ?? 0} helper="Recent export usage" tone="blue" />
                <Kpi icon={QrCode} label="QR failures (7d)" value={production?.audit?.qrFailedLast7d ?? 0} helper="Verification errors" tone={Number(production?.audit?.qrFailedLast7d || 0) > 0 ? "amber" : "emerald"} />
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="text-sm font-medium">Readiness checks</div>
                  <div className="mt-3 space-y-2">
                    {(production?.readiness?.checks || []).map((check) => (
                      <div key={check.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-3 text-sm">
                        <div>{check.message}</div>
                        <span className={check.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                          {check.ok ? "OK" : "Missing"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="text-sm font-medium">Recent notification failures</div>
                  <div className="mt-3 space-y-2">
                    {(production?.notifications?.recentFailures || []).map((failure) => (
                      <div key={failure.id} className="rounded-xl border border-border bg-surface px-3 py-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{failure.template}</div>
                          <div className="text-xs text-tertiary">{new Date(failure.created_at).toLocaleString()}</div>
                        </div>
                        <div className="mt-1 text-secondary-muted">{failure.channel} / {failure.error || "Unknown provider error"}</div>
                      </div>
                    ))}
                    {!production?.notifications?.recentFailures?.length && (
                      <div className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-secondary-muted">
                        No recent notification failures.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="mt-6 rounded-3xl border border-border bg-surface elev-card p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Grouped application analytics</h2>
                  <p className="text-sm text-secondary-muted mt-1">Discipline-wise, weight-wise, and category-wise reporting with status totals.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => loadAnalytics("")} disabled={loadingAnalytics}>
                    <RefreshCcw className="size-4" /> Refresh analytics
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
                <div className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-secondary-muted flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-medium text-foreground">Season scope</span>
                  <span>{selectedTournament ? `${selectedTournament.name}${selectedTournament.deleted_at ? " (Archived)" : ""}` : "All tournaments"}</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr_auto_auto]">
                  <select
                    value={selectedTournamentId}
                    onChange={(event) => setSelectedTournamentId(event.target.value)}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="">All tournaments</option>
                    {tournaments.map((tournament) => (
                      <option key={tournament.id} value={tournament.id}>{tournament.name}{tournament.deleted_at ? " (Archived)" : ""}</option>
                    ))}
                  </select>
                  <Input
                    value={selectedDiscipline}
                    onChange={(event) => setSelectedDiscipline(event.target.value)}
                    className="h-10 bg-background"
                    placeholder="Filter discipline"
                  />
                  <Button variant="outline" onClick={handleAnalyticsPdfExport} disabled={loadingAnalytics}>
                    <Download className="size-4" /> PDF
                  </Button>
                  <Button variant="outline" onClick={() => handleSeasonReportPdf()} disabled={!selectedTournamentId}>
                    <Download className="size-4" /> Season report
                  </Button>
                  <Button onClick={() => loadAnalytics(undefined)} disabled={loadingAnalytics}>
                    {loadingAnalytics ? "Loading..." : "Apply filters"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Kpi icon={Users} label="All applications" value={analytics?.totals?.total ?? 0} helper="Across current filters" tone="default" />
                <Kpi icon={Users} label="Approved" value={analytics?.totals?.approved ?? 0} helper="Approved rows" tone="emerald" />
                <Kpi icon={AlertTriangle} label="Pending" value={(analytics?.totals?.submitted ?? 0) + (analytics?.totals?.under_review ?? 0) + (analytics?.totals?.needs_correction ?? 0)} helper="Submitted, review, correction" tone="amber" />
                <Kpi icon={AlertTriangle} label="Rejected" value={analytics?.totals?.rejected ?? 0} helper="Rejected rows" tone="red" />
              </div>

              {loadingAnalytics ? (
                <div className="mt-5">
                  <SectionLoader
                    title="Loading grouped analytics"
                    description="Aggregating applications by discipline, weight class, and generated category."
                    cards={3}
                    rows={4}
                    compact
                  />
                </div>
              ) : (
                <div className="mt-5 grid gap-5 xl:grid-cols-3 items-start">
                  <GroupedAnalyticsTable title="By discipline" rows={analytics?.disciplineGroups || []} />
                  <GroupedAnalyticsTable title="By weight class" rows={analytics?.weightClassGroups || []} />
                  <GroupedAnalyticsTable title="By category" rows={(analytics?.categoryGroups || []).map((row) => ({ ...row, label: `${row.label} / ${row.discipline} / ${row.weightClass}` }))} />
                </div>
              )}
            </section>
          )}

          {isAdmin && (
            <section className="mt-6 rounded-3xl border border-border bg-surface elev-card p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Approved participants report</h2>
                  <p className="text-sm text-secondary-muted mt-1">Club-wise and individual participant tables for approved applications.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={handleParticipantsPdfExport}>
                    <Download className="size-4" /> Participant roster (PDF)
                  </Button>
                  <Button variant="outline" size="sm" disabled={downloadingAllPdfs || loadingParticipants} onClick={handleDownloadAllParticipantPdfs}>
                    <InlineLoadingLabel loading={downloadingAllPdfs} loadingText="Preparing ZIP...">
                      <>
                        <Download className="size-4" /> Download all participants (ZIP)
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
                <div className="mt-5 grid gap-5 2xl:grid-cols-2">
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

          {isAdmin && tournaments.length ? (
            <section className="mt-6 rounded-3xl border border-border bg-surface elev-card p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Seasonal archive reports</h2>
                  <p className="text-sm text-secondary-muted mt-1">
                    Full retrospective reports for every season. Applications are never deleted — past data
                    stays available for download forever.
                  </p>
                </div>
              </div>
              <ul className="mt-4 grid gap-3 lg:grid-cols-2">
                {[...tournaments]
                  .sort((a, b) => {
                    const aDate = a.starts_on || a.createdAt || "";
                    const bDate = b.starts_on || b.createdAt || "";
                    return String(bDate).localeCompare(String(aDate));
                  })
                  .map((tournament) => (
                    <li
                      key={tournament.id}
                      className="rounded-2xl border border-border bg-background/60 p-4 flex items-start justify-between gap-4 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{tournament.name}</div>
                        <div className="mt-1 text-xs text-tertiary">
                          Season {tournament.season || "—"}
                          {tournament.starts_on ? ` · ${String(tournament.starts_on).slice(0, 10)}` : ""}
                          {tournament.deleted_at ? " · archived" : ""}
                          {tournament.registrationOpen ? " · open for registration" : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            api
                              .downloadApprovedParticipantsPdf({ tournamentId: tournament.id })
                              .then(({ error }) => {
                                if (error) toast.error(error.message || "Failed to export participants");
                                else toast.success("Participants PDF export started");
                              })
                          }
                        >
                          <Download className="size-4" /> Participants
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleSeasonReportPdf(tournament.id)}>
                          <Download className="size-4" /> Full season report
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
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
      row.applicationDisplayId,
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function ParticipantTable({ title, rows, showClub, onDownloadApplication }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-background/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-border font-medium text-sm">{title}</div>
      <div className="space-y-3 p-4 md:hidden">
        {rows.map((row) => (
          <article key={`${row.applicationId}-${row.profileId}`} className="rounded-2xl border border-border bg-surface p-4">
            <div className="font-medium">{row.participantName}</div>
            <div className="mt-1 text-[11px] text-tertiary">{row.applicationDisplayId || row.applicationId}</div>
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
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-[920px] w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
              <th className="px-4 py-3 min-w-[220px]">Name</th>
              <th className="px-4 py-3 whitespace-nowrap">DOB</th>
              <th className="px-4 py-3 whitespace-nowrap">Age today</th>
              <th className="px-4 py-3 whitespace-nowrap">Sex</th>
              <th className="px-4 py-3 whitespace-nowrap">Discipline</th>
              {showClub && <th className="px-4 py-3 min-w-[180px]">Club</th>}
              <th className="px-4 py-3 text-right whitespace-nowrap">Print form</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.applicationId}-${row.profileId}`} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-sm">
                  <div className="font-medium">{row.participantName}</div>
                  <div className="text-[11px] text-tertiary mt-1">{row.applicationDisplayId || row.applicationId}</div>
                  <div className="text-[11px] text-tertiary mt-1">{row.tournamentName}</div>
                </td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">{row.dateOfBirth || "-"}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">{row.ageToday ?? "-"}</td>
                <td className="px-4 py-3 text-sm capitalize whitespace-nowrap">{row.sex || "-"}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">{row.discipline || "-"}</td>
                {showClub && <td className="px-4 py-3 text-sm">{row.clubName || "-"}</td>}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="outline" size="sm" onClick={() => onDownloadApplication(row.applicationId)}>
                    <Download className="size-3.5" /> PDF
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="px-4 py-4 text-sm text-secondary-muted">No rows found.</div>}
    </div>
  );
}

function GroupedAnalyticsTable({ title, rows }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="min-w-0 rounded-2xl border border-border bg-background/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-border font-medium text-sm">{title}</div>
      <div className="space-y-3 p-4 max-h-[720px] overflow-y-auto">
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border border-border bg-surface p-4">
            <button type="button" onClick={() => setExpanded((current) => (current === row.id ? null : row.id))} className="w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{row.label}</div>
                  {row.sampleApplicationDisplayId ? <div className="mt-1 text-[11px] text-tertiary">Example record: {row.sampleApplicationDisplayId}</div> : null}
                </div>
                <div className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-tertiary">
                  {row.statuses.total} total
                </div>
              </div>
            </button>
            {expanded === row.id ? (
              <>
                {row.participantDetails?.length ? (
                  <div className="mt-3 rounded-xl border border-border bg-background/60 p-3 text-[11px] leading-5 text-tertiary">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary-muted">Participants</div>
                    <div className="space-y-1">
                      {row.participantDetails.map((item) => <div key={item}>{item}</div>)}
                    </div>
                  </div>
                ) : row.participantNames?.length ? (
                  <div className="mt-3 rounded-xl border border-border bg-background/60 p-3 text-[11px] leading-5 text-tertiary">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary-muted">Participants</div>
                    <div className="space-y-1">
                      {row.participantNames.map((item) => <div key={item}>{item}</div>)}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <DetailStat label="Total" value={row.statuses.total} />
              <DetailStat label="Approved" value={row.statuses.approved} />
              <DetailStat label="Rejected" value={row.statuses.rejected} />
              <DetailStat label="Submitted" value={row.statuses.submitted} />
              <DetailStat label="Review" value={row.statuses.under_review} />
              <DetailStat label="Correction" value={row.statuses.needs_correction} />
              <DetailStat label="Season closed" value={row.statuses.season_closed} />
                </div>
              </>
            ) : null}
          </article>
        ))}
        {!rows.length && <div className="px-1 py-2 text-sm text-secondary-muted">No grouped rows found.</div>}
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

function DetailStat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</div>
      <div className="mt-1 text-sm capitalize">{value}</div>
    </div>
  );
}
