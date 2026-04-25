import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, Download, Eye, FileCheck2, FileText, Gavel, Mail as MailIcon, ScanLine, ShieldAlert, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import { InlineLoadingLabel, SectionLoader } from "@/components/shared/PrimalLoader";
import { ResponsivePageShell, StickyActionBar } from "@/components/shared/ResponsivePrimitives";
import api from "@/lib/api";
import { formatPersonName } from "@/lib/person";
import { toast } from "sonner";
import LiveDocumentScanner from "@/components/scanner/LiveDocumentScanner";

function getAccessMessage(application) {
  if (!application) return "";
  if (application.status === "draft") {
    return "Drafts remain visible here, but editing and submission depend on the tournament registration window.";
  }
  if (application.status === "needs_correction") {
    if (application.correction_due_at) {
      return `Correction access stays open until ${new Date(application.correction_due_at).toLocaleString()}.`;
    }
    return "Correction access stays tied to the correction window set by admin.";
  }
  if (application.status === "season_closed") {
    return "This record is archived because the season has ended. Reapply from an open season card to create a new draft with your saved details.";
  }
  return "Submitted applications remain viewable after registration closes, even when they are no longer editable.";
}

const REQUIRED_UPLOADS = [
  {
    kind: "medical",
    label: "Medical certificate",
    description: "Capture the doctor-approved medical certificate or upload a clear PDF copy.",
    accepts: "image/*,application/pdf",
    capture: "environment",
    icon: FileText,
  },
  {
    kind: "photo_id",
    label: "Photo ID",
    description: "Use the rear camera for a flat, readable ID photo with all edges visible.",
    accepts: "image/*",
    capture: "environment",
    icon: Camera,
  },
  {
    kind: "consent",
    label: "Signed consent",
    description: "Scan the signed application or consent sheet directly from the phone camera.",
    accepts: "image/*,application/pdf",
    capture: "environment",
    icon: ScanLine,
  },
];

function formatFileSize(file) {
  if (!file?.size) return "-";
  if (file.size < 1024 * 1024) return `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file) {
  return Boolean(file?.type?.startsWith("image/"));
}

export default function ApplicantDashboard() {
  const [profile, setProfile] = useState(null);
  const [applications, setApplications] = useState([]);
  const [appealsByApplication, setAppealsByApplication] = useState({});
  const [appealDrafts, setAppealDrafts] = useState({});
  const [filingAppealId, setFilingAppealId] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [activeApplication, setActiveApplication] = useState(null);
  const [activeApplicationDetails, setActiveApplicationDetails] = useState(null);
  const [loadingApplicationId, setLoadingApplicationId] = useState(null);
  const [publicTournaments, setPublicTournaments] = useState([]);
  const [startingSeasonId, setStartingSeasonId] = useState(null);
  const [draftUploads, setDraftUploads] = useState({});
  const [submittingDraftId, setSubmittingDraftId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getMyProfile(), api.listApplications(), api.myAppeals(), api.publicTournaments()]).then(([profileRes, appRes, appealRes, tournamentRes]) => {
      if (!profileRes.error) setProfile(profileRes.data.profile);
      if (!appRes.error) setApplications(appRes.data.items || []);
      if (!appealRes.error) {
        const index = {};
        for (const appeal of appealRes.data.appeals || []) {
          if (!index[appeal.application_id]) index[appeal.application_id] = appeal;
        }
        setAppealsByApplication(index);
      }
      if (!tournamentRes.error) setPublicTournaments(tournamentRes.data.tournaments || []);
      setLoading(false);
    });
  }, []);

  async function submitAppeal(applicationId) {
    const reason = (appealDrafts[applicationId] || "").trim();
    if (reason.length < 10) {
      toast.error("Appeal reason must be at least 10 characters");
      return;
    }
    setFilingAppealId(applicationId);
    const { data, error } = await api.fileAppeal({ applicationId, reason });
    setFilingAppealId(null);
    if (error) {
      toast.error(error.message || "Failed to file appeal");
      return;
    }
    const appeal = data?.appeal;
    if (appeal) {
      setAppealsByApplication((current) => ({ ...current, [applicationId]: appeal }));
    }
    setAppealDrafts((current) => ({ ...current, [applicationId]: "" }));
    toast.success("Appeal filed successfully");
  }

  async function downloadApplicationPdf(applicationId) {
    if (!applicationId) return;
    setDownloadingPdf(true);
    const { error } = await api.downloadApplicationPdf(applicationId);
    setDownloadingPdf(false);
    if (error) {
      toast.error(error.message || "Failed to download application PDF");
      return;
    }
    toast.success("Application PDF download started");
  }

  async function openApplication(application) {
    setLoadingApplicationId(application.id);
    const { data, error } = await api.getApplication(application.id);
    setLoadingApplicationId(null);
    if (error) {
      toast.error(error.message || "Failed to load application details");
      return;
    }
    setActiveApplication(application);
    setActiveApplicationDetails(data?.application || null);
  }

  async function startSeasonApplication(tournament) {
    if (!profile?.id) {
      toast.error("Complete your profile before applying for a new season");
      return;
    }

    setStartingSeasonId(tournament.id);
    const { data, error } = await api.createApplication({
      tournamentId: tournament.id,
      formData: {
        selectedDisciplines: profile.metadata?.selectedDisciplines || [],
        experienceLevel: profile.metadata?.experienceLevel || null,
        notes: "",
      },
    });
    setStartingSeasonId(null);

    if (error) {
      toast.error(error.message || "Failed to start season application");
      return;
    }

    const nextApplication = data?.application;
    if (nextApplication) {
      setApplications((current) => [nextApplication, ...current]);
      toast.success(`Draft created for ${tournament.name}`);
    }
  }

  async function reapplyFromPreviousSeason(sourceApplication, tournament) {
    setStartingSeasonId(tournament.id);
    const { data, error } = await api.reapplyApplication(sourceApplication.id, { tournamentId: tournament.id });
    setStartingSeasonId(null);

    if (error) {
      toast.error(error.message || "Failed to reapply for the new season");
      return;
    }

    const nextApplication = data?.application;
    if (nextApplication) {
      setApplications((current) => [nextApplication, ...current]);
      toast.success(`Reapplied into ${tournament.name}`);
    }
  }

  async function withdrawApplication(application) {
    if (!application?.id) return;
    if (!confirm(`Withdraw your application for "${application.tournament_name}"? Reviewers will see a cancel request and may close it out. Your data is not deleted.`)) return;
    const reason = window.prompt("Optional reason:") || "Applicant withdrew via dashboard";
    const { error } = await api.requestApplicationCancel(application.id, { reason });
    if (error) {
      toast.error(error.message || "Failed to request withdrawal");
      return;
    }
    toast.success("Withdrawal request sent to reviewers");
    const appRes = await api.listApplications();
    if (!appRes.error) setApplications(appRes.data.items || []);
  }

  function setDraftFile(applicationId, kind, file) {
    setDraftUploads((current) => ({
      ...current,
      [applicationId]: {
        ...(current[applicationId] || {}),
        [kind]: file || null,
      },
    }));
  }

  async function uploadAndSubmitDraft(application) {
    const files = draftUploads[application.id] || {};
    const requiredKinds = REQUIRED_UPLOADS.map((item) => item.kind);
    const missing = requiredKinds.filter((kind) => !files[kind]);
    if (missing.length) {
      toast.error("Upload medical certificate, photo ID, and signed consent before submitting");
      return;
    }

    setSubmittingDraftId(application.id);
    for (const kind of requiredKinds) {
      const file = files[kind];
      const capturedVia = typeof file?.name === "string" && file.name.startsWith("scan-") ? "scan" : "upload";
      const { error } = await api.uploadApplicationDocument(application.id, {
        file,
        kind,
        label: file.name,
        capturedVia,
      });
      if (error) {
        setSubmittingDraftId(null);
        toast.error(error.message || `Failed to upload ${kind}`);
        return;
      }
    }

    const { data, error } = await api.submitApplication(application.id);
    setSubmittingDraftId(null);
    if (error) {
      toast.error(error.message || "Failed to submit application");
      return;
    }

    const submittedApplication = data?.application;
    if (submittedApplication) {
      setApplications((current) => current.map((item) => (item.id === application.id ? submittedApplication : item)));
    }
    setDraftUploads((current) => ({ ...current, [application.id]: {} }));
    toast.success("Season application submitted");
  }

  const approvedCount = applications.filter((application) => application.status === "approved").length;
  const pendingCount = applications.filter((application) => ["submitted", "under_review", "needs_correction"].includes(application.status)).length;
  const address = profile?.metadata?.address || null;
  const openSeasonTournaments = useMemo(
    () => publicTournaments.filter((tournament) => tournament.registrationOpen),
    [publicTournaments]
  );
  const latestReusableApplication = useMemo(
    () => applications.find((application) => ["season_closed", "approved", "rejected"].includes(application.status)) || null,
    [applications]
  );
  const applicationsByTournament = useMemo(
    () => Object.fromEntries(applications.map((application) => [application.tournament_id, application])),
    [applications]
  );

  /* Partition applications into "current season" and "archived".
     Current  = application still in an active workflow state (any status
                except season_closed) AND its tournament is either open for
                registration now, or doesn't exist in the public list (e.g.
                the owner-created a season and registration hasn't opened yet).
     Archived = season_closed records, plus any past-tournament records whose
                tournament is no longer in the open-season list. Archived data
                is never deleted; it's collapsed under an Accordion to keep
                the current tab uncluttered. */
  const openSeasonTournamentIds = useMemo(
    () => new Set(openSeasonTournaments.map((tournament) => tournament.id)),
    [openSeasonTournaments]
  );
  const { currentApplications, archivedApplications } = useMemo(() => {
    const current = [];
    const archived = [];
    for (const application of applications) {
      const isArchivedStatus = application.status === "season_closed";
      const isOpenSeason = openSeasonTournamentIds.has(application.tournament_id);
      if (isArchivedStatus || !isOpenSeason) archived.push(application);
      else current.push(application);
    }
    return { currentApplications: current, archivedApplications: archived };
  }, [applications, openSeasonTournamentIds]);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  if (loading) {
    return (
      <ResponsivePageShell className="max-w-6xl">
        <SectionLoader
          title="Loading application workspace"
          description="Fetching your profile, applications, and appeal history."
          cards={2}
          rows={4}
        />
      </ResponsivePageShell>
    );
  }
  if (!profile) {
    return (
      <div className="p-10">
        <EmptyState icon={FileCheck2} title="No applicant profile found" description="Complete registration to create your reusable profile and tournament application." />
      </div>
    );
  }

  return (
    <ResponsivePageShell className="max-w-6xl">
      <div className="rounded-3xl border border-border bg-surface elev-card overflow-hidden">
        <div className="bg-gradient-to-br from-surface-muted to-surface p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">My application</div>
              <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">{formatPersonName(profile.first_name, profile.last_name)}</h1>
              <p className="text-sm text-secondary-muted mt-2 max-w-2xl">
                Your reusable profile is saved once and reused across tournaments. Each submission enters the review queue with full status history.
              </p>
            </div>
            {applications[0] && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full sm:w-auto"
                disabled={downloadingPdf}
                onClick={() => downloadApplicationPdf(applications[0].id)}
              >
                <InlineLoadingLabel loading={downloadingPdf} loadingText="Preparing PDF...">
                  <>
                    <Download className="size-3.5" /> Application PDF
                  </>
                </InlineLoadingLabel>
              </Button>
            )}
          </div>

          <div className="mt-8 grid sm:grid-cols-3 gap-3">
            <Metric label="Applications" value={applications.length} helper="Tournament submissions" />
            <Metric label="Approved" value={approvedCount} helper="Cleared by the review team" />
            <Metric label="Pending review" value={pendingCount} helper="Still moving through workflow" />
          </div>
        </div>
        <div className="border-t border-border px-6 sm:px-8 py-5 bg-surface-muted/30 flex items-center gap-2 text-sm">
          <FileCheck2 className="size-4 text-primary" />
          <span className="font-medium">Workflow:</span>
          <span className="text-secondary-muted">draft to submitted to under review to correction loop to approved, rejected, or season closed</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.45fr_0.85fr] gap-5 mt-6">
        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-surface elev-card p-6">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Open seasons</h2>
              <p className="text-sm text-secondary-muted mt-1">Existing participants can start a new season application here as soon as registration opens.</p>
            </div>
            <div className="mt-5 space-y-4">
              {openSeasonTournaments.map((tournament) => {
                const existingApplication = applicationsByTournament[tournament.id];
                return (
                  <article key={tournament.id} className="rounded-2xl border border-border bg-background/60 p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-display text-xl font-semibold tracking-tight">{tournament.name}</div>
                        <div className="text-sm text-secondary-muted mt-1">
                          Registration closes {tournament.registration_close_at ? new Date(tournament.registration_close_at).toLocaleString() : "when admin ends the season"}
                        </div>
                      </div>
                      {existingApplication ? <StatusPill status={existingApplication.status} /> : null}
                    </div>
                    <div className="mt-4 flex justify-end">
                      {existingApplication ? (
                        <Button variant="outline" onClick={() => openApplication(existingApplication)} disabled={loadingApplicationId === existingApplication.id}>
                          <InlineLoadingLabel loading={loadingApplicationId === existingApplication.id} loadingText="Opening...">
                            <>
                              <Eye className="size-3.5" /> Open application
                            </>
                          </InlineLoadingLabel>
                        </Button>
                      ) : (
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                          {latestReusableApplication ? (
                            <Button onClick={() => reapplyFromPreviousSeason(latestReusableApplication, tournament)} disabled={startingSeasonId === tournament.id}>
                              <InlineLoadingLabel loading={startingSeasonId === tournament.id} loadingText="Reapplying...">
                                Reapply from last season
                              </InlineLoadingLabel>
                            </Button>
                          ) : null}
                          <Button variant={latestReusableApplication ? "outline" : "default"} onClick={() => startSeasonApplication(tournament)} disabled={startingSeasonId === tournament.id}>
                            <InlineLoadingLabel loading={startingSeasonId === tournament.id} loadingText="Starting...">
                              Start season application
                            </InlineLoadingLabel>
                          </Button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              {!openSeasonTournaments.length && (
                <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-sm text-secondary-muted">
                  No season is open right now. You can still sign in, review your saved profile, and wait for the next registration window.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface elev-card p-6">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Current season</h2>
              <p className="text-sm text-secondary-muted mt-1">Active tournament submissions. Edit drafts, respond to corrections, and submit while registration is open.</p>
            </div>
            {!currentApplications.length && (
              <div className="mt-5 rounded-2xl border border-dashed border-border bg-background/40 p-6 text-sm text-secondary-muted text-center">
                No current-season submissions yet. When a tournament opens registration it will appear here; past applications stay below for reference and reapply.
              </div>
            )}
            <div className="mt-5 space-y-4">
              {currentApplications.map((application) => (
                <article key={application.id} className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-display text-xl font-semibold tracking-tight">{application.tournament_name}</div>
                      <div className="text-sm text-secondary-muted mt-1">
                        {application.discipline || "Profile discipline pending"} · {application.weight_class || "Weight class pending"}
                      </div>
                    </div>
                    <StatusPill status={application.status} />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
                    <Detail label="Updated" value={new Date(application.updated_at).toLocaleDateString()} />
                    <Detail label="Application ID" value={application.application_display_id || application.id} />
                    <Detail label="Reviewer" value={application.reviewer_display_id || "Unassigned"} />
                    <Detail label="Correction due" value={application.correction_due_at ? new Date(application.correction_due_at).toLocaleDateString() : "-"} />
                  </div>
                  {(application.review_notes || application.rejection_reason || application.reopen_reason) && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                        <AlertCircle className="size-4" /> Decision notes from reviewer
                      </div>
                      {application.rejection_reason && (
                        <div className="mt-2 text-sm text-secondary"><strong>Reason:</strong> {application.rejection_reason}</div>
                      )}
                      {application.review_notes && (
                        <div className="mt-2 text-sm text-secondary"><strong>Notes:</strong> {application.review_notes}</div>
                      )}
                      {application.reopen_reason && (
                        <div className="mt-2 text-sm text-secondary"><strong>Reopen reason:</strong> {application.reopen_reason}</div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => downloadApplicationPdf(application.id)} disabled={downloadingPdf}>
                      <Download className="size-3.5" /> PDF
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href="mailto:operations@primalfight.io?subject=Application%20help" title="Contact the tournament operations team">
                        <MailIcon className="size-3.5" /> Contact organizers
                      </a>
                    </Button>
                    {!["approved", "rejected", "season_closed"].includes(application.status) && (
                      <Button variant="ghost" size="sm" onClick={() => withdrawApplication(application)}>
                        <XCircle className="size-3.5" /> Withdraw
                      </Button>
                    )}
                    <Button className="w-full sm:w-auto" variant="outline" onClick={() => openApplication(application)} disabled={loadingApplicationId === application.id}>
                      <InlineLoadingLabel loading={loadingApplicationId === application.id} loadingText="Opening...">
                        <>
                          <Eye className="size-3.5" /> View application
                        </>
                      </InlineLoadingLabel>
                    </Button>
                  </div>

                  {application.status === "draft" ? (
                    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                      <div className="font-medium text-sm">Finish this season application</div>
                      <p className="mt-2 text-sm text-secondary-muted">
                        Upload or scan each required document here, confirm the preview, then submit while registration is still open.
                      </p>
                      <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Mobile capture</div>
                            <div className="mt-1 text-sm text-secondary-muted">
                              On mobile, use scan to open the camera directly and preview each document before submission.
                            </div>
                          </div>
                          <div className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-secondary-muted">
                            3 required items
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 xl:grid-cols-3">
                          {REQUIRED_UPLOADS.map((item) => (
                            <DraftUploadCard
                              key={item.kind}
                              applicationId={application.id}
                              item={item}
                              file={draftUploads[application.id]?.[item.kind] || null}
                              onFileChange={setDraftFile}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button className="w-full sm:w-auto" onClick={() => uploadAndSubmitDraft(application)} disabled={submittingDraftId === application.id}>
                          <InlineLoadingLabel loading={submittingDraftId === application.id} loadingText="Submitting...">
                            Submit this season application
                          </InlineLoadingLabel>
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {(["rejected", "needs_correction"].includes(application.status)) && (
                    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Gavel className="size-4 text-primary" /> Appeal panel
                      </div>
                      {appealsByApplication[application.id] ? (
                        <div className="mt-2 text-sm text-secondary-muted">
                          Appeal status: <span className="capitalize">{appealsByApplication[application.id].status?.replace("_", " ")}</span>
                        </div>
                      ) : (
                        <>
                          <p className="mt-2 text-sm text-secondary-muted">
                            If you disagree with the review outcome, submit an appeal for admin decision.
                          </p>
                          <Textarea
                            className="mt-3 bg-background"
                            rows={3}
                            placeholder="Explain why this decision should be reconsidered"
                            value={appealDrafts[application.id] || ""}
                            onChange={(event) => setAppealDrafts((current) => ({ ...current, [application.id]: event.target.value }))}
                          />
                          <div className="mt-3">
                            <Button
                              className="w-full sm:w-auto"
                              variant="outline"
                              onClick={() => submitAppeal(application.id)}
                              disabled={filingAppealId === application.id}
                            >
                              {filingAppealId === application.id ? "Submitting..." : "File appeal"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>

          {archivedApplications.length > 0 && (
            <div className="rounded-3xl border border-border bg-surface elev-card p-6">
              <button
                type="button"
                onClick={() => setArchivedExpanded((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={archivedExpanded}
              >
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Past applications</h2>
                  <p className="text-sm text-secondary-muted mt-1">
                    {archivedApplications.length} archived record{archivedApplications.length === 1 ? "" : "s"}. Data is retained for the federation record — nothing here is deleted.
                  </p>
                </div>
                <span className="rounded-full border border-border bg-background px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-secondary-muted">
                  {archivedExpanded ? "Hide" : "Show"}
                </span>
              </button>
              {archivedExpanded && (
                <div className="mt-5 space-y-3">
                  {archivedApplications.map((application) => {
                    const matchingOpenTournament = openSeasonTournaments.find((tournament) => !applicationsByTournament[tournament.id]);
                    const canReapply = ["season_closed", "approved", "rejected"].includes(application.status) && matchingOpenTournament;
                    return (
                      <article key={application.id} className="rounded-2xl border border-border bg-background/40 p-4 opacity-95">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-display text-lg font-semibold tracking-tight truncate">{application.tournament_name}</div>
                            <div className="text-xs text-tertiary mt-1">
                              {application.application_display_id || application.id} · updated {new Date(application.updated_at).toLocaleDateString()}
                            </div>
                          </div>
                          <StatusPill status={application.status} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openApplication(application)}
                            disabled={loadingApplicationId === application.id}
                          >
                            <InlineLoadingLabel loading={loadingApplicationId === application.id} loadingText="Opening...">
                              <>
                                <Eye className="size-3.5" /> View application
                              </>
                            </InlineLoadingLabel>
                          </Button>
                          {canReapply && (
                            <Button
                              size="sm"
                              onClick={() => reapplyFromPreviousSeason(application, matchingOpenTournament)}
                              disabled={startingSeasonId === matchingOpenTournament.id}
                            >
                              <InlineLoadingLabel loading={startingSeasonId === matchingOpenTournament.id} loadingText="Reapplying...">
                                Reapply to {matchingOpenTournament.name}
                              </InlineLoadingLabel>
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeApplicationDetails && activeApplication ? (
            <div className="rounded-3xl border border-border bg-surface elev-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Application details</h2>
                  <p className="text-sm text-secondary-muted mt-1">{activeApplication.tournament_name}</p>
                </div>
                <Button variant="ghost" onClick={() => { setActiveApplication(null); setActiveApplicationDetails(null); }}>Close</Button>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 text-sm text-secondary-muted">
                {getAccessMessage(activeApplication)}
              </div>

              <div className="mt-5 grid sm:grid-cols-2 gap-3 text-sm">
                <Detail label="Status" value={activeApplicationDetails.status?.replace(/_/g, " ") || "-"} />
                <Detail label="Tournament" value={activeApplicationDetails.tournament_name || "-"} />
                <Detail label="Club" value={activeApplicationDetails.club_name || "Individual"} />
                <Detail label="Phone" value={activeApplicationDetails.phone || profile?.phone || profile?.metadata?.phone || "-"} />
                <Detail label="Weight class" value={activeApplicationDetails.weight_class || "-"} />
              </div>

              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">Submitted form data</div>
                <pre className="mt-2 w-full min-h-[220px] text-xs font-mono overflow-auto rounded-lg border border-border bg-background p-3">
                  {JSON.stringify(activeApplicationDetails.form_data || {}, null, 2)}
                </pre>
              </div>

              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">Status timeline</div>
                <div className="mt-2 space-y-2">
                  {(activeApplicationDetails.statusEvents || []).map((event) => (
                    <div key={event.id} className="rounded-xl border border-border bg-background/60 px-3 py-3 text-sm">
                      <div className="font-medium">{event.to_status?.replace(/_/g, " ") || "-"}</div>
                      <div className="text-secondary-muted mt-1">{event.reason || "No reason captured"}</div>
                    </div>
                  ))}
                  {!(activeApplicationDetails.statusEvents || []).length && (
                    <div className="text-sm text-secondary-muted">No timeline events available.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl border border-border bg-surface elev-card p-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">Profile summary</h2>
            <Separator className="my-4" />
            <dl className="space-y-3 text-sm">
              <Detail label="Phone" value={profile.phone || profile.metadata?.phone || "-"} />
              <Detail label="Nationality" value={profile.nationality || "-"} />
              <Detail label="State" value={address?.state || "-"} />
              <Detail label="District" value={address?.district || "-"} />
              <Detail label="Postal code" value={address?.postalCode || "-"} />
              <Detail label="Discipline" value={profile.discipline || "-"} />
              <Detail label="Weight" value={profile.weight_kg ? `${profile.weight_kg} kg` : "-"} />
              <Detail label="Weight class" value={profile.weight_class || "-"} />
            </dl>
          </div>

          <div className="rounded-3xl border border-border bg-surface elev-card p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">Appeals and correction loop</h3>
                <p className="text-sm text-secondary-muted mt-2">
                  If a reviewer requests changes, edit is allowed only inside the correction window. Rejections can be appealed and reopened by admin.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {activeApplicationDetails ? (
        <StickyActionBar className="md:hidden">
          <Button variant="outline" className="w-full" onClick={() => { setActiveApplication(null); setActiveApplicationDetails(null); }}>
            Close details
          </Button>
        </StickyActionBar>
      ) : null}
    </ResponsivePageShell>
  );
}

function Metric({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</div>
      <div className="font-display text-3xl font-semibold tracking-tight mt-2">{value}</div>
      <div className="text-xs text-secondary-muted mt-1">{helper}</div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function DraftUploadCard({ applicationId, item, file, onFileChange }) {
  const libraryInputRef = useRef(null);
  const Icon = item.icon;
  const [scannerOpen, setScannerOpen] = useState(false);

  function openLibraryPicker() {
    if (libraryInputRef.current) {
      libraryInputRef.current.click();
    }
  }

  function handleFileSelection(event) {
    onFileChange(applicationId, item.kind, event.target.files?.[0] || null);
    event.target.value = "";
  }

  function handleScannerCapture(captured) {
    onFileChange(applicationId, item.kind, captured);
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-background text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{item.label}</div>
          <p className="mt-1 text-sm text-secondary-muted">{item.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SelectedFilePreview file={file} label={item.label} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <Button type="button" variant="outline" className="w-full justify-center" onClick={() => setScannerOpen(true)}>
            <ScanLine className="size-4" /> Scan with camera
          </Button>
          <Button type="button" variant="outline" className="w-full justify-center" onClick={openLibraryPicker}>
            <Upload className="size-4" /> Upload from device
          </Button>
        </div>
      </div>

      <input
        ref={libraryInputRef}
        type="file"
        accept={item.accepts}
        onChange={handleFileSelection}
        className="hidden"
      />
      <LiveDocumentScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onCapture={handleScannerCapture}
        title={`Scan ${item.label.toLowerCase()}`}
        hint={item.description}
      />
    </div>
  );
}

function SelectedFilePreview({ file, label }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!file || !isImageFile(file)) {
      setPreviewUrl(null);
      return undefined;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [file]);

  if (!file) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/70 px-4 py-6 text-center">
        <div className="text-sm font-medium">{label} preview</div>
        <div className="mt-1 text-sm text-secondary-muted">Nothing selected yet.</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background/70">
      {previewUrl ? (
        <img src={previewUrl} alt={`${label} preview`} className="h-40 w-full object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center bg-surface-muted px-4 text-center text-sm text-secondary-muted">
          Preview unavailable for this file type.
        </div>
      )}
      <div className="space-y-1 border-t border-border px-4 py-3">
        <div className="text-sm font-medium break-all">{file.name}</div>
        <div className="text-xs text-secondary-muted">
          {file.type || "Unknown file type"} / {formatFileSize(file)}
        </div>
      </div>
    </div>
  );
}
