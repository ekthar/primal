import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, Download, Eye, FileCheck2, FileEdit, FileText, History, Mail as MailIcon, Save, ScanLine, Send, ShieldAlert, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import { InlineLoadingLabel, SectionLoader } from "@/components/shared/PrimalLoader";
import { ResponsivePageShell, StickyActionBar } from "@/components/shared/ResponsivePrimitives";
import api, { resolveBackendUrl } from "@/lib/api";
import { formatPersonName } from "@/lib/person";
import { toast } from "sonner";
import LiveDocumentScanner from "@/components/scanner/LiveDocumentScanner";
import {
  pickEditableFormData,
  serializeFormDataForPatch,
} from "@/components/application/ApplicationEditFields";
import {
  ApplicationFormEditor,
  pickEditableProfile,
  serializeProfileForPatch,
} from "@/components/application/ApplicationFormEditor";
import { ApplicationWorkspace, WorkspacePanel, WorkspaceSection } from "@/components/application/ApplicationWorkspace";
import { useLocale } from "@/context/LocaleContext";

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
  const locale = useLocale();
  const [profile, setProfile] = useState(null);
  const [applications, setApplications] = useState([]);
  const [appealsByApplication, setAppealsByApplication] = useState({});
  const [appealDrafts, setAppealDrafts] = useState({});
  const [filingAppealId, setFilingAppealId] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [activeApplication, setActiveApplication] = useState(null);
  const [activeApplicationDetails, setActiveApplicationDetails] = useState(null);
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState("documents");
  const [loadingApplicationId, setLoadingApplicationId] = useState(null);
  const [publicTournaments, setPublicTournaments] = useState([]);
  const [startingSeasonId, setStartingSeasonId] = useState(null);
  const [reapplyChoice, setReapplyChoice] = useState(null);
  const [draftUploads, setDraftUploads] = useState({});
  const [draftEdits, setDraftEdits] = useState({});
  const [draftProfileEdits, setDraftProfileEdits] = useState({});
  const [savingDraftId, setSavingDraftId] = useState(null);
  const [submittingDraftId, setSubmittingDraftId] = useState(null);
  const [correctionEdits, setCorrectionEdits] = useState({});
  const [correctionProfileEdits, setCorrectionProfileEdits] = useState({});
  const [submittingCorrectionId, setSubmittingCorrectionId] = useState(null);
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

  async function openApplication(application, section = null) {
    setLoadingApplicationId(application.id);
    const { data, error } = await api.getApplication(application.id);
    setLoadingApplicationId(null);
    if (error) {
      toast.error(error.message || "Failed to load application details");
      return;
    }
    setActiveApplication(application);
    setActiveApplicationDetails(data?.application || null);
    setActiveWorkspaceSection(section || (["draft", "needs_correction"].includes(application.status) ? "edit" : "documents"));
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
      await openApplication(nextApplication, "edit");
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
      setReapplyChoice(null);
      toast.success(`Reapplied into ${tournament.name}`);
      await openApplication(nextApplication, "edit");
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

  function getDraftEdits(application) {
    if (draftEdits[application.id]) return draftEdits[application.id];
    return pickEditableFormData(application);
  }

  function setDraftEditsFor(applicationId, next) {
    setDraftEdits((current) => ({ ...current, [applicationId]: next }));
  }

  function getDraftProfileEdits(application) {
    if (draftProfileEdits[application.id]) return draftProfileEdits[application.id];
    return pickEditableProfile(profile);
  }

  function setDraftProfileEditsFor(applicationId, next) {
    setDraftProfileEdits((current) => ({ ...current, [applicationId]: next }));
  }

  function getCorrectionEdits(application) {
    if (correctionEdits[application.id]) return correctionEdits[application.id];
    return pickEditableFormData(application);
  }

  function setCorrectionEditsFor(applicationId, next) {
    setCorrectionEdits((current) => ({ ...current, [applicationId]: next }));
  }

  function getCorrectionProfileEdits(application) {
    if (correctionProfileEdits[application.id]) return correctionProfileEdits[application.id];
    return pickEditableProfile(profile);
  }

  function setCorrectionProfileEditsFor(applicationId, next) {
    setCorrectionProfileEdits((current) => ({ ...current, [applicationId]: next }));
  }

  async function saveDraftApplication(application) {
    const edits = getDraftEdits(application);
    const profileEdits = getDraftProfileEdits(application);
    setSavingDraftId(application.id);

    if (profile && draftProfileEdits[application.id]) {
      const profilePayload = serializeProfileForPatch(profileEdits, profile);
      const { data: profileRes, error: profileError } = await api.upsertMyProfile(profilePayload);
      if (profileError) {
        setSavingDraftId(null);
        toast.error(profileError.message || "Failed to save participant profile");
        return false;
      }
      if (profileRes?.profile) setProfile(profileRes.profile);
    }

    const { data, error } = await api.updateApplication(application.id, {
      formData: serializeFormDataForPatch(edits),
    });
    setSavingDraftId(null);

    if (error) {
      toast.error(error.message || "Failed to save application draft");
      return false;
    }

    const savedApplication = { ...application, ...(data?.application || {}) };
    setApplications((current) => current.map((item) => (item.id === application.id ? { ...item, ...savedApplication } : item)));
    setActiveApplication((current) => (current?.id === application.id ? { ...current, ...savedApplication } : current));
    setActiveApplicationDetails((current) => (current?.id === application.id ? { ...current, ...savedApplication } : current));
    setDraftEdits((current) => { const next = { ...current }; delete next[application.id]; return next; });
    setDraftProfileEdits((current) => { const next = { ...current }; delete next[application.id]; return next; });
    toast.success("Application draft saved");
    return true;
  }

  async function saveCorrections(application, { resubmit = false } = {}) {
    const edits = getCorrectionEdits(application);
    const profileEdits = getCorrectionProfileEdits(application);
    setSubmittingCorrectionId(application.id);
    const filesByKind = draftUploads[application.id] || {};
    for (const kind of Object.keys(filesByKind)) {
      const file = filesByKind[kind];
      if (!file) continue;
      const capturedVia = typeof file?.name === "string" && file.name.startsWith("scan-") ? "scan" : "upload";
      const { error: uploadError } = await api.uploadApplicationDocument(application.id, { file, kind, label: file.name, capturedVia });
      if (uploadError) {
        setSubmittingCorrectionId(null);
        toast.error(uploadError.message || `Failed to replace ${kind}`);
        return;
      }
    }
    if (profile && correctionProfileEdits[application.id]) {
      const profilePayload = serializeProfileForPatch(profileEdits, profile);
      const { data: profileRes, error: profileError } = await api.upsertMyProfile(profilePayload);
      if (profileError) {
        setSubmittingCorrectionId(null);
        toast.error(profileError.message || "Failed to save profile changes");
        return;
      }
      if (profileRes?.profile) setProfile(profileRes.profile);
    }
    const { data: patchData, error: patchError } = await api.updateApplication(application.id, {
      formData: serializeFormDataForPatch(edits),
    });
    if (patchError) {
      setSubmittingCorrectionId(null);
      toast.error(patchError.message || "Failed to save corrections");
      return;
    }
    let next = patchData?.application || application;
    if (resubmit) {
      const { data: subData, error: subError } = await api.resubmitApplication(application.id);
      if (subError) {
        setSubmittingCorrectionId(null);
        toast.error(subError.message || "Failed to resubmit application");
        setApplications((current) => current.map((item) => (item.id === application.id ? next : item)));
        return;
      }
      next = subData?.application || next;
    }
    setApplications((current) => current.map((item) => (item.id === application.id ? next : item)));
    setActiveApplication((current) => (current?.id === application.id ? { ...current, ...next } : current));
    setActiveApplicationDetails((current) => (current?.id === application.id ? { ...current, ...next } : current));
    setDraftUploads((current) => ({ ...current, [application.id]: {} }));
    setCorrectionEdits((current) => { const c = { ...current }; delete c[application.id]; return c; });
    setCorrectionProfileEdits((current) => { const c = { ...current }; delete c[application.id]; return c; });
    setSubmittingCorrectionId(null);
    if (resubmit) setActiveWorkspaceSection("history");
    toast.success(resubmit ? "Corrections sent for re-review" : "Corrections saved");
  }

  async function uploadAndSubmitDraft(application) {
    const saved = await saveDraftApplication(application);
    if (!saved) return;

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
      setActiveApplication((current) => (current?.id === application.id ? { ...current, ...submittedApplication } : current));
      setActiveApplicationDetails((current) => (current?.id === application.id ? { ...current, ...submittedApplication } : current));
      setActiveWorkspaceSection("history");
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

  function renderApplicationEditor(application) {
    if (application.status === "draft") {
      return (
        <WorkspacePanel title="Edit draft" helper="Complete participant details before uploading documents and submitting.">
          <ApplicationFormEditor
            mode="applicant"
            profile={profile}
            profileValue={getDraftProfileEdits(application)}
            onProfileChange={(next) => setDraftProfileEditsFor(application.id, next)}
            formDataValue={getDraftEdits(application)}
            onFormDataChange={(next) => setDraftEditsFor(application.id, next)}
            idPrefix={`applicant-draft-${application.id}`}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => saveDraftApplication(application)} disabled={savingDraftId === application.id}>
              <InlineLoadingLabel loading={savingDraftId === application.id} loadingText="Saving...">
                <>
                  <Save className="size-3.5" /> Save draft
                </>
              </InlineLoadingLabel>
            </Button>
          </div>
        </WorkspacePanel>
      );
    }
    if (application.status === "needs_correction") {
      return (
        <WorkspacePanel title="Correct application" helper="Update the flagged profile or application fields, then resubmit from Actions.">
          <ApplicationFormEditor
            mode="applicant"
            profile={profile}
            profileValue={getCorrectionProfileEdits(application)}
            onProfileChange={(next) => setCorrectionProfileEditsFor(application.id, next)}
            formDataValue={getCorrectionEdits(application)}
            onFormDataChange={(next) => setCorrectionEditsFor(application.id, next)}
            flaggedFields={application.correction_fields}
            idPrefix={`applicant-correction-${application.id}`}
          />
        </WorkspacePanel>
      );
    }
    return (
      <WorkspacePanel title="Read-only application" helper={getAccessMessage(application)}>
        <ApplicationDetailsView application={activeApplicationDetails || application} profile={profile} showDocuments={false} showHistory={false} />
      </WorkspacePanel>
    );
  }

  function renderDocumentWorkspace(application) {
    const documents = activeApplicationDetails?.documents || [];
    const editable = ["draft", "needs_correction"].includes(application.status);
    return (
      <div className="space-y-4">
        {editable ? (
          <WorkspacePanel
            title={application.status === "draft" ? "Required documents" : "Replace documents"}
            helper={application.status === "draft" ? "Scan or upload every required document before submitting." : "Replace only the documents requested by the reviewer, if needed."}
          >
            <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
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
          </WorkspacePanel>
        ) : null}
        <DocumentsView documents={documents} />
      </div>
    );
  }

  function renderApplicantActions(application) {
    const showAppeal = ["rejected", "needs_correction"].includes(application.status);
    return (
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <WorkspacePanel title="Workflow actions" helper={getAccessMessage(application)}>
          <div className="grid gap-2">
            {application.status === "draft" ? (
              <Button onClick={() => uploadAndSubmitDraft(application)} disabled={submittingDraftId === application.id}>
                <InlineLoadingLabel loading={submittingDraftId === application.id} loadingText="Submitting...">
                  Submit this season application
                </InlineLoadingLabel>
              </Button>
            ) : null}
            {application.status === "needs_correction" ? (
              <>
                <Button variant="outline" onClick={() => saveCorrections(application, { resubmit: false })} disabled={submittingCorrectionId === application.id}>
                  <InlineLoadingLabel loading={submittingCorrectionId === application.id} loadingText="Saving...">Save correction</InlineLoadingLabel>
                </Button>
                <Button onClick={() => saveCorrections(application, { resubmit: true })} disabled={submittingCorrectionId === application.id}>
                  <InlineLoadingLabel loading={submittingCorrectionId === application.id} loadingText="Resubmitting...">Resubmit for review</InlineLoadingLabel>
                </Button>
              </>
            ) : null}
            {!["approved", "rejected", "season_closed"].includes(application.status) ? (
              <Button variant="outline" onClick={() => withdrawApplication(application)}>
                <XCircle className="size-3.5" /> Withdraw
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => downloadApplicationPdf(application.id)} disabled={downloadingPdf}>
              <Download className="size-3.5" /> PDF
            </Button>
            <Button variant="ghost" asChild>
              <a href="mailto:operations@primalfight.io?subject=Application%20help" title="Contact the tournament operations team">
                <MailIcon className="size-3.5" /> Contact organizers
              </a>
            </Button>
          </div>
        </WorkspacePanel>

        {showAppeal ? (
          <WorkspacePanel title="Appeal" helper="If you disagree with the review outcome, submit an appeal for admin decision.">
            {appealsByApplication[application.id] ? (
              <div className="text-sm text-secondary-muted">
                Appeal status: <span className="capitalize">{appealsByApplication[application.id].status?.replace("_", " ")}</span>
              </div>
            ) : (
              <>
                <Textarea
                  className="bg-background"
                  rows={4}
                  placeholder="Explain why this decision should be reconsidered"
                  value={appealDrafts[application.id] || ""}
                  onChange={(event) => setAppealDrafts((current) => ({ ...current, [application.id]: event.target.value }))}
                />
                <Button
                  className="mt-3 w-full sm:w-auto"
                  variant="outline"
                  onClick={() => submitAppeal(application.id)}
                  disabled={filingAppealId === application.id}
                >
                  {filingAppealId === application.id ? "Submitting..." : "File appeal"}
                </Button>
              </>
            )}
          </WorkspacePanel>
        ) : null}
      </div>
    );
  }

  function renderActiveApplicationWorkspace() {
    if (!activeApplicationDetails || !activeApplication) return null;
    const application = { ...activeApplication, ...activeApplicationDetails };
    const correctionBanner = application.status === "needs_correction" && (application.correction_reason || application.correction_fields?.length) ? (
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/50 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-amber-900">
          <AlertCircle className="size-4" /> Reviewer correction request
        </div>
        {application.correction_reason ? <div className="mt-2 text-secondary">{application.correction_reason}</div> : null}
        {application.correction_fields?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {application.correction_fields.map((field) => (
              <span key={field} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                {String(field).replace(/_/g, " ")}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    ) : null;
    const sections = [
      {
        id: "edit",
        label: "Edit",
        icon: FileEdit,
        content: renderApplicationEditor(application),
      },
      {
        id: "documents",
        label: "Documents",
        icon: FileText,
        content: renderDocumentWorkspace(application),
      },
      {
        id: "history",
        label: "History",
        icon: History,
        content: <StatusTimelineView events={application.statusEvents || []} />,
      },
      {
        id: "actions",
        label: "Actions",
        icon: Send,
        content: renderApplicantActions(application),
      },
    ];

    return (
      <ApplicationWorkspace
        title={application.tournament_name || "Application"}
        subtitle={application.applicant_display_name || formatPersonName(profile.first_name, profile.last_name)}
        status={<StatusPill status={application.status} />}
        meta={[
          { label: "Application", value: application.application_display_id || application.id },
          { label: "Discipline", value: application.discipline || "-" },
          { label: "Weight class", value: application.weight_class || "-" },
        ]}
        banner={correctionBanner}
        sections={sections}
        activeSection={activeWorkspaceSection}
        onSectionChange={setActiveWorkspaceSection}
        onClose={() => { setActiveApplication(null); setActiveApplicationDetails(null); }}
      />
    );
  }

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
              <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{locale?.t("pages.applicant.title", "My application") ?? "My application"}</div>
              <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">{formatPersonName(profile.first_name, profile.last_name)}</h1>
              <p className="text-sm text-secondary-muted mt-2 max-w-2xl">
                {locale?.t("applicant.profileHelper", "Your reusable profile is saved once and reused across tournaments. Each submission enters the review queue with full status history.") ?? "Your reusable profile is saved once and reused across tournaments. Each submission enters the review queue with full status history."}
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
                            <Button onClick={() => setReapplyChoice({ sourceApplication: latestReusableApplication, tournament })} disabled={startingSeasonId === tournament.id}>
                              Reapply from last season
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

          {reapplyChoice ? (
            <div className="rounded-3xl border border-border bg-surface elev-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Reapply</div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight mt-1">Create draft from past application</h2>
                  <p className="mt-2 text-sm text-secondary-muted">
                    Source: {reapplyChoice.sourceApplication.tournament_name || "Previous season"} / Target: {reapplyChoice.tournament.name}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setReapplyChoice(null)}>Close</Button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3 text-sm">
                <DetailCard label="Copied profile" value={formatPersonName(profile.first_name, profile.last_name)} />
                <DetailCard label="Source application" value={reapplyChoice.sourceApplication.application_display_id || reapplyChoice.sourceApplication.id} />
                <DetailCard label="Target tournament" value={reapplyChoice.tournament.name} />
              </div>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => reapplyFromPreviousSeason(reapplyChoice.sourceApplication, reapplyChoice.tournament)} disabled={startingSeasonId === reapplyChoice.tournament.id}>
                  <InlineLoadingLabel loading={startingSeasonId === reapplyChoice.tournament.id} loadingText="Creating draft...">
                    Create draft
                  </InlineLoadingLabel>
                </Button>
              </div>
            </div>
          ) : null}

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
                    <Button className="w-full sm:w-auto" variant="outline" onClick={() => openApplication(application)} disabled={loadingApplicationId === application.id}>
                      <InlineLoadingLabel loading={loadingApplicationId === application.id} loadingText="Opening...">
                        <>
                          <Eye className="size-3.5" /> Open workspace
                        </>
                      </InlineLoadingLabel>
                    </Button>
                  </div>

                  {application.status === "draft" ? (
                    <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm text-secondary-muted">
                      Draft editing, document upload, and submit actions are in the application workspace.
                    </div>
                  ) : null}

                  {application.status === "needs_correction" ? (
                    <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50/40 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                        <AlertCircle className="size-4" /> Correct your application
                      </div>
                      {Array.isArray(application.correction_fields) && application.correction_fields.length ? (
                        <div className="mt-2 text-xs text-amber-900">
                          <span className="font-medium">Flagged fields:</span>{" "}
                          {application.correction_fields.map((f) => (
                            <span key={f} className="inline-block mr-1.5 rounded-full bg-amber-100/80 px-2 py-0.5 capitalize">{String(f).replace(/_/g, " ")}</span>
                          ))}
                        </div>
                      ) : null}
                      {application.correction_reason ? (
                        <div className="mt-2 text-sm text-secondary"><strong>Reviewer note:</strong> {application.correction_reason}</div>
                      ) : null}
                      <p className="mt-3 text-sm text-secondary-muted">Open the workspace to edit flagged fields, replace documents, and resubmit.</p>
                    </div>
                  ) : null}
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
                              onClick={() => setReapplyChoice({ sourceApplication: application, tournament: matchingOpenTournament })}
                              disabled={startingSeasonId === matchingOpenTournament.id}
                            >
                              Reapply to {matchingOpenTournament.name}
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

          {renderActiveApplicationWorkspace()}
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

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.map(formatToken).join(", ") : "-";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatToken(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getApplicationAddress(application, profile) {
  return application?.metadata?.address || profile?.metadata?.address || {};
}

function getLatestDocumentByKind(documents, kind) {
  if (!Array.isArray(documents)) return null;
  return documents.find((documentRow) => documentRow.kind === kind) || null;
}

function ApplicationDetailsView({ application, profile, showDocuments = true, showHistory = true }) {
  const formData = application.form_data || {};
  const address = getApplicationAddress(application, profile);
  const categoryEntries = Array.isArray(formData.categoryEntries) ? formData.categoryEntries : [];

  return (
    <div className="mt-5 space-y-5">
      <WorkspaceSection title="Participant profile">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <DetailCard label="Full name" value={application.applicant_display_name || formatPersonName(application.first_name, application.last_name)} />
          <DetailCard label="Application ID" value={application.application_display_id || application.id} />
          <DetailCard label="Status" value={formatToken(application.status || "")} />
          <DetailCard label="Tournament" value={application.tournament_name || "-"} />
          <DetailCard label="Club" value={application.club_name || "Individual"} />
          <DetailCard label="Email" value={application.email || "-"} />
          <DetailCard label="Phone" value={application.phone || profile?.phone || profile?.metadata?.phone || "-"} />
          <DetailCard label="Gender" value={formatDisplayValue(application.gender || profile?.gender)} />
          <DetailCard label="Date of birth" value={application.date_of_birth ? new Date(application.date_of_birth).toLocaleDateString() : "-"} />
          <DetailCard label="Nationality" value={application.nationality || profile?.nationality || "-"} />
          <DetailCard label="Address" value={[address.line1, address.line2, address.district, address.state, address.postalCode].filter(Boolean).join(", ") || "-"} wide />
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Competition entry">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <DetailCard label="Selected disciplines" value={formatDisplayValue(formData.selectedDisciplines || application.discipline)} />
          <DetailCard label="Experience level" value={formatDisplayValue(formData.experienceLevel)} />
          <DetailCard label="Years training" value={formatDisplayValue(formData.yearsTraining)} />
          <DetailCard label="Profile weight" value={application.weight_kg ? `${application.weight_kg} kg` : "-"} />
          <DetailCard label="Entry weight" value={formData.weightKg ? `${formData.weightKg} kg` : "-"} />
          <DetailCard label="Weight class" value={application.weight_class || "-"} />
          <DetailCard label="Reviewer notes" value={formData.notes || "-"} wide />
        </div>
        {categoryEntries.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {categoryEntries.map((entry, index) => (
              <div key={`${entry.disciplineId || "entry"}-${index}`} className="rounded-xl border border-border bg-surface px-3 py-3 text-sm">
                <div className="font-medium">{formatDisplayValue(entry.disciplineLabel || entry.disciplineId)}</div>
                <div className="mt-1 text-secondary-muted">{formatDisplayValue(entry.categoryLabel || entry.weightClass || entry.category)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </WorkspaceSection>

      <WorkspaceSection title="Corner and emergency contact">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <DetailCard label="Coach name" value={formData.cornerCoachName || "-"} />
          <DetailCard label="Coach phone" value={formData.cornerCoachPhone || "-"} />
          <DetailCard label="Emergency contact" value={formData.emergencyContactName || "-"} />
          <DetailCard label="Relation" value={formData.emergencyContactRelation || "-"} />
          <DetailCard label="Emergency phone" value={formData.emergencyContactPhone || "-"} />
          <DetailCard label="Medical notes" value={formData.medicalNotes || "-"} wide />
        </div>
      </WorkspaceSection>

      {showDocuments ? <DocumentsView documents={application.documents || []} /> : null}
      {showHistory ? <StatusTimelineView events={application.statusEvents || []} /> : null}
    </div>
  );
}

function SectionTitle({ title }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">
      {title}
    </div>
  );
}

function DetailCard({ label, value, wide }) {
  return (
    <div className={`rounded-xl border border-border bg-surface px-3 py-3 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{label}</div>
      <div className="mt-1 break-words text-sm text-foreground">{formatDisplayValue(value)}</div>
    </div>
  );
}

function DocumentsView({ documents }) {
  return (
    <WorkspaceSection title="Documents">
      <div className="grid gap-3">
        {REQUIRED_UPLOADS.map((item) => {
          const documentRow = getLatestDocumentByKind(documents, item.kind);
          return (
            <DocumentCard key={item.kind} item={item} documentRow={documentRow} />
          );
        })}
      </div>
    </WorkspaceSection>
  );
}

function DocumentCard({ item, documentRow }) {
  const Icon = item.icon;
  const documentUrl = resolveBackendUrl(documentRow?.url || "");
  const verified = Boolean(documentRow?.verified_at);
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-primary">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{item.label}</div>
            <div className="mt-1 text-xs text-secondary-muted">
              {documentRow ? `${documentRow.label || documentRow.original_filename || "Uploaded file"} / ${formatFileSize({ size: documentRow.size_bytes })}` : "Not uploaded yet"}
            </div>
            {documentRow?.verify_reason ? (
              <div className="mt-1 text-xs text-amber-700">{documentRow.verify_reason}</div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-[11px] ${verified ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-border bg-background text-secondary-muted"}`}>
            {verified ? "Verified" : documentRow ? "Uploaded" : "Missing"}
          </span>
          {documentUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={documentUrl} target="_blank" rel="noreferrer">
                <Eye className="size-3.5" /> Open
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusTimelineView({ events }) {
  return (
    <section className="rounded-2xl border border-border bg-background/60 p-4">
      <SectionTitle title="Status timeline" />
      <div className="mt-4 space-y-2">
        {events.map((event) => (
          <div key={event.id} className="rounded-xl border border-border bg-surface px-3 py-3 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-medium">{formatToken(event.to_status || "")}</div>
              <div className="text-xs text-tertiary">{formatDateTime(event.created_at)}</div>
            </div>
            <div className="text-secondary-muted mt-1">{event.reason || "No reason captured"}</div>
          </div>
        ))}
        {!events.length ? (
          <div className="text-sm text-secondary-muted">No timeline events available.</div>
        ) : null}
      </div>
    </section>
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
        <div className="grid grid-cols-1 gap-2">
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
      <div className="flex h-24 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/40 px-3 text-center">
        <div className="text-xs text-secondary-muted">Nothing selected yet</div>
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
