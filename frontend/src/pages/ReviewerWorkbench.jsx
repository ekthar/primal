import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  FileWarning,
  ListChecks,
  QrCode,
  RefreshCcw,
  Search,
  ShieldCheck,
  Swords,
  Mail,
  Undo2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import StatusPill from "@/components/shared/StatusPill";
import CredentialCard from "@/components/shared/CredentialCard";
import EmptyState from "@/components/shared/EmptyState";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { StickyActionBar } from "@/components/shared/ResponsivePrimitives";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import api, { resolveBackendUrl } from "@/lib/api";
import {
  pickEditableFormData,
  serializeFormDataForPatch,
} from "@/components/application/ApplicationEditFields";
import { ApplicationFormEditor } from "@/components/application/ApplicationFormEditor";
import LiveQrScanner from "@/components/scanner/LiveQrScanner";
import { formatPersonName } from "@/lib/person";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";

const CORRECTION_FIELD_OPTIONS = [
  { id: "selectedDisciplines", label: "Disciplines" },
  { id: "experienceLevel", label: "Experience level" },
  { id: "yearsTraining", label: "Years training" },
  { id: "weightKg", label: "Walking weight" },
  { id: "cornerCoachName", label: "Corner / coach" },
  { id: "cornerCoachPhone", label: "Coach phone" },
  { id: "emergencyContactName", label: "Emergency contact" },
  { id: "emergencyContactRelation", label: "Emergency relation" },
  { id: "emergencyContactPhone", label: "Emergency phone" },
  { id: "medicalNotes", label: "Medical notes" },
  { id: "notes", label: "Notes" },
  { id: "medical", label: "Medical document" },
  { id: "photo_id", label: "Photo ID" },
  { id: "consent", label: "Signed consent" },
];
const PAGE_SIZE = 100;

function parseFieldTokens(fieldsString) {
  if (!fieldsString) return [];
  return fieldsString
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function serializeFieldTokens(tokens) {
  return Array.from(new Set(tokens)).join(", ");
}

export default function ReviewerWorkbench() {
  const { user } = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const routeId = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;
  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingMoreQueue, setLoadingMoreQueue] = useState(false);
  const [hasMoreQueue, setHasMoreQueue] = useState(false);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(routeId || null);
  const [activeApplication, setActiveApplication] = useState(null);
  const [loadingApplication, setLoadingApplication] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerResult, setScannerResult] = useState(null);
  const [scannedValue, setScannedValue] = useState("");
  const [reviewDialog, setReviewDialog] = useState({ open: false, action: null, reason: "", fields: "" });
  const [adminEditOpen, setAdminEditOpen] = useState(false);
  const [adminEditDraft, setAdminEditDraft] = useState(() => pickEditableFormData(null));
  const [adminEditSaving, setAdminEditSaving] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfPreviewError, setPdfPreviewError] = useState(null);
  const scannerRequestRef = useRef("");
  const queueRequestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadQueue();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!routeId) return;
    setActiveId(routeId);
  }, [routeId]);

  useEffect(() => {
    if (!queue.length) {
      setActiveApplication(null);
      return;
    }
    if (routeId) return;
    if (!activeId) setActiveId(queue[0].id);
    if (activeId && !queue.some((item) => item.id === activeId)) {
      setActiveId(queue[0].id);
    }
  }, [activeId, queue, routeId]);

  useEffect(() => {
    if (!activeId) return;
    loadApplication(activeId);
  }, [activeId]);

  useEffect(() => {
    let revoked = false;
    let createdUrl = null;
    setPdfPreviewError(null);
    setPdfPreviewUrl(null);
    if (!activeApplication?.id) return undefined;
    (async () => {
      const { data, error } = await api.applicationPdfBlobUrl(activeApplication.id);
      if (revoked) return;
      if (error) {
        setPdfPreviewError(error.message || "Could not load preview");
        return;
      }
      createdUrl = data;
      setPdfPreviewUrl(data);
    })();
    return () => {
      revoked = true;
      if (createdUrl && typeof window !== "undefined") {
        try { window.URL.revokeObjectURL(createdUrl); } catch { /* noop */ }
      }
    };
  }, [activeApplication?.id]);

  useEffect(() => {
    if (!scannerOpen) {
      setScannerError("");
      setScannerBusy(false);
      setScannerResult(null);
      scannerRequestRef.current = "";
    }
  }, [scannerOpen]);

  async function loadQueue({ append = false, offset = 0 } = {}) {
    const requestId = queueRequestRef.current + 1;
    queueRequestRef.current = requestId;
    if (append) setLoadingMoreQueue(true);
    else setLoadingQueue(true);
    const { data, error } = await api.queueBoard({ status: "all", q: search || undefined, limit: PAGE_SIZE, offset });
    if (requestId !== queueRequestRef.current) return;
    if (append) setLoadingMoreQueue(false);
    else setLoadingQueue(false);
    if (error) {
      toast.error(error.message || "Failed to load reviewer queue");
      return;
    }
    const items = data.items || [];
    setQueue((current) => append ? [...current, ...items] : items);
    setHasMoreQueue(items.length === PAGE_SIZE);
  }

  function loadMoreQueue() {
    if (loadingQueue || loadingMoreQueue || !hasMoreQueue) return;
    loadQueue({ append: true, offset: queue.length });
  }

  async function loadApplication(id) {
    setLoadingApplication(true);
    const { data, error } = await api.getApplication(id);
    setLoadingApplication(false);
    if (error) {
      setActiveApplication(null);
      toast.error(error.message || "Failed to load application details");
      return;
    }
    setActiveApplication(data.application);
  }

  async function refreshAll() {
    await loadQueue();
    if (activeId) await loadApplication(activeId);
  }

  function openAdminEdit() {
    if (!activeApplication) return;
    setAdminEditDraft(pickEditableFormData(activeApplication));
    setAdminEditOpen(true);
  }

  async function saveAdminEdit() {
    if (!activeApplication) return;
    setAdminEditSaving(true);
    const { data, error } = await api.updateApplication(activeApplication.id, {
      formData: serializeFormDataForPatch(adminEditDraft),
    });
    setAdminEditSaving(false);
    if (error) {
      toast.error(error.message || "Failed to save changes");
      return;
    }
    if (data?.application) setActiveApplication((current) => ({ ...current, ...data.application, statusEvents: current?.statusEvents }));
    setAdminEditOpen(false);
    toast.success("Application updated");
  }

  async function verifyScannedCode(rawValue) {
    const normalizedValue = String(rawValue || "").trim();
    if (!normalizedValue || scannerBusy || scannerRequestRef.current === normalizedValue) return;
    scannerRequestRef.current = normalizedValue;
    setScannerBusy(true);
    setScannerError("");
    setScannerResult(null);
    setScannedValue(normalizedValue);

    let verificationUrl;
    try {
      verificationUrl = new URL(normalizedValue, window.location.origin);
    } catch (_error) {
      setScannerBusy(false);
      scannerRequestRef.current = "";
      setScannerError("The scanned QR code is not a valid verification URL.");
      return;
    }

    if (!verificationUrl.pathname.includes("/api/public/verify/application-signature")) {
      setScannerBusy(false);
      scannerRequestRef.current = "";
      setScannerError("This QR code is not a Primal application verification code.");
      return;
    }

    const { data, error } = await api.verifyApplicationSignatureUrl(verificationUrl.toString());
    setScannerBusy(false);
    if (error) {
      setScannerResult(null);
      scannerRequestRef.current = "";
      setScannerError(error.message || error.reason || "Verification failed.");
      return;
    }

    setScannerResult(data);
    if (data?.valid && data?.application?.id) {
      toast.success("Signature verified. Opening application.");
      setScannerOpen(false);
      setActiveId(data.application.id);
      router.replace(`/admin/review/${data.application.id}`);
    } else {
      scannerRequestRef.current = "";
    }
  }

  function openVerifiedApplication() {
    const applicationId = scannerResult?.application?.id;
    if (!applicationId) return;
    setScannerOpen(false);
    setActiveId(applicationId);
    router.replace(`/admin/review/${applicationId}`);
  }

  async function handleStartReview() {
    if (!activeId) return;
    setActionBusy(true);
    const { error } = await api.startReview(activeId);
    setActionBusy(false);
    if (error) {
      toast.error(error.message || "Failed to start review");
      return;
    }
    toast.success("Review started");
    refreshAll();
  }

  function openReviewDialog(action) {
    if (action === "approve") {
      handleDecision("approve");
      return;
    }

    setReviewDialog({
      open: true,
      action,
        reason: action === "reject" ? "Eligibility criteria not met" : action === "request_correction" ? "Please update the flagged fields" : "Appeal granted",
      fields: "",
    });
  }

  function closeReviewDialog() {
    setReviewDialog({ open: false, action: null, reason: "", fields: "" });
  }

  async function handleDecision(action, reviewInput) {
    if (!activeId) return;
    let reason = reviewInput?.reason;
    let fields = reviewInput?.fields || [];

    if (action === "reject") {
      if (!reason) return;
    }
    if (action === "request_correction") {
      if (!reason) return;
      if (!fields.length) {
        toast.error("At least one correction field is required");
        return;
      }
    }

    setActionBusy(true);
    const { error } = await api.decide(activeId, { action, reason, fields });
    setActionBusy(false);
    if (error) {
      toast.error(error.message || "Decision failed");
      return;
    }
    toast.success(action === "approve" ? "Application approved" : action === "reject" ? "Application rejected" : "Correction requested");
    refreshAll();
  }

  async function handleResendNotification() {
    if (!activeId || !activeApplication) return;
    const template = activeApplication.status === "approved" ? "application.approved"
      : activeApplication.status === "rejected" ? "application.rejected"
      : activeApplication.status === "needs_correction" ? "application.needs_correction"
      : null;
    if (!template) {
      toast.error("Resend is only available for approved, rejected, or correction-requested applications.");
      return;
    }
    setActionBusy(true);
    const { error } = await api.resendNotification(activeId, {
      template,
      channels: ["whatsapp", "email", "sms"],
      reason: activeApplication.review_notes || activeApplication.rejection_reason || "",
    });
    setActionBusy(false);
    if (error) {
      toast.error(error.message || "Failed to resend notification");
      return;
    }
    toast.success("Notification dispatched (WhatsApp, then email/SMS fallback)");
  }

  async function handleDocumentVerify(documentId, verified, reason) {
    if (!activeId) return;
    setActionBusy(true);
    const { data, error } = await api.verifyApplicationDocument(activeId, documentId, {
      verified,
      reason: verified ? null : (reason || ""),
    });
    setActionBusy(false);
    if (error) {
      toast.error(error.message || "Verification failed");
      return;
    }
    toast.success(verified ? "Document verified" : "Document marked as rejected");
    setActiveApplication((current) => {
      if (!current) return current;
      const next = data?.document;
      if (!next) return current;
      return {
        ...current,
        documents: (current.documents || []).map((doc) => (doc.id === documentId ? { ...doc, ...next } : doc)),
      };
    });
  }

  async function handleReopen(reason) {
    if (!activeId) return;
    if (!reason) return;
    setActionBusy(true);
    const { error } = await api.reopen(activeId, reason);
    setActionBusy(false);
    if (error) {
      toast.error(error.message || "Failed to reopen application");
      return;
    }
    toast.success("Application reopened to under review");
    refreshAll();
  }

  async function handleConfirmReviewDialog() {
    const reason = reviewDialog.reason.trim();
    const fields = reviewDialog.action === "request_correction"
      ? reviewDialog.fields.split(",").map((item) => item.trim()).filter(Boolean)
      : [];

    if (reviewDialog.action === "reopen") {
      await handleReopen(reason);
      closeReviewDialog();
      return;
    }

    await handleDecision(reviewDialog.action, { reason, fields });
    closeReviewDialog();
  }

  const requiredKinds = ["medical", "photo_id", "consent"];
  const hasRequiredDocs = useMemo(() => {
    if (!activeApplication?.documents) return false;
    return requiredKinds.every((kind) => activeApplication.documents.some((doc) => doc.kind === kind));
  }, [activeApplication]);

  const canDecide = activeApplication && ["submitted", "under_review"].includes(activeApplication.status);
  const canReopen = user?.role === "admin" && activeApplication && ["approved", "rejected"].includes(activeApplication.status);

  if (!loadingQueue && !queue.length) {
    return (
      <div className="p-10">
        <EmptyState icon={Search} title="No review items available" description="Queue is empty for your current filters." />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      <aside className="hidden lg:flex w-[340px] shrink-0 flex-col border-r border-border bg-surface/40">
        <div className="p-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{locale?.t("reviewer.eyebrow", "Participant review") ?? "Participant review"}</div>
          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-tertiary" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8 h-9 bg-surface" placeholder={locale?.t("reviewer.searchQueue", "Search queue") ?? "Search queue"} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingQueue && (
            <div className="p-4">
              <SectionLoader
                title={locale?.t("reviewer.loadingQueue", "Loading review queue") ?? "Loading review queue"}
                description={locale?.t("reviewer.loadingQueueHelper", "Fetching the next applications that need a reviewer decision.") ?? "Fetching the next applications that need a reviewer decision."}
                cards={1}
                rows={4}
                compact
              />
            </div>
          )}
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
                  <div className="text-sm font-medium truncate">{entry.applicant_display_name || formatPersonName(entry.first_name, entry.last_name)}</div>
                  <div className="text-[11px] text-tertiary mt-1 truncate">
                    {(entry.application_display_id || entry.id)} · {entry.tournament_name}
                  </div>
                </div>
                <StatusPill status={entry.status} size="xs" />
              </div>
            </button>
          ))}
          {hasMoreQueue ? (
            <div className="p-4">
              <Button variant="outline" className="w-full" onClick={loadMoreQueue} disabled={loadingMoreQueue}>
                {loadingMoreQueue ? "Loading..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex-1 overflow-y-auto">
        {!activeApplication || loadingApplication ? (
          <div className="p-6">
            <SectionLoader
              title={locale?.t("reviewer.loadingApplication", "Loading application details") ?? "Loading application details"}
              description={locale?.t("reviewer.loadingApplicationHelper", "Pulling the latest fighter profile, documents, and audit timeline.") ?? "Pulling the latest fighter profile, documents, and audit timeline."}
              cards={2}
              rows={4}
              compact
            />
          </div>
        ) : (
          <>
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="px-3 py-3 sm:px-6 sm:py-5 flex items-center gap-3 sm:gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] sm:text-xs text-tertiary">
                <span className="font-mono truncate">{activeApplication.application_display_id || activeApplication.id}</span>
                <ChevronRight className="size-3 shrink-0" />
                <span className="truncate">{activeApplication.tournament_name}</span>
              </div>
              <h2 className="font-display text-lg sm:text-2xl font-semibold tracking-tight mt-1 truncate">
                {activeApplication.applicant_display_name || formatPersonName(activeApplication.first_name, activeApplication.last_name)}
              </h2>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <StatusPill status={activeApplication.status} />
                <span className="text-xs text-tertiary">{activeApplication.club_name || (locale?.t("reviewer.individualApplicant", "Individual applicant") ?? "Individual applicant")}</span>
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-2">
              {activeApplication.status === "submitted" && (
                <Button variant="outline" disabled={actionBusy} onClick={handleStartReview}>
                  <RefreshCcw className="size-4 mr-1.5" /> {locale?.t("reviewer.startReview", "Start review") ?? "Start review"}
                </Button>
              )}
              {canDecide && (
                <Button variant="outline" disabled={actionBusy} onClick={() => openReviewDialog("request_correction")}>
                  <FileWarning className="size-4 mr-1.5" /> {locale?.t("reviewer.correction", "Correction") ?? "Correction"}
                </Button>
              )}
              {canDecide && (
                <Button variant="outline" disabled={actionBusy} onClick={() => openReviewDialog("reject")}>
                  <XCircle className="size-4 mr-1.5" /> {locale?.t("reviewer.reject", "Reject") ?? "Reject"}
                </Button>
              )}
              {canDecide && (
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionBusy} onClick={() => openReviewDialog("approve")}>
                  <CheckCircle2 className="size-4 mr-1.5" /> {locale?.t("reviewer.approve", "Approve") ?? "Approve"}
                </Button>
              )}
              {canReopen && (
                <Button variant="outline" disabled={actionBusy} onClick={() => openReviewDialog("reopen")}>
                  <Undo2 className="size-4 mr-1.5" /> {locale?.t("reviewer.reopen", "Reopen") ?? "Reopen"}
                </Button>
              )}
              {["approved", "rejected", "needs_correction"].includes(activeApplication.status) && (
                <Button variant="outline" disabled={actionBusy} onClick={handleResendNotification} title={locale?.t("reviewer.resendNotificationTooltip", "Resend decision email + SMS to the applicant") ?? "Resend decision email + SMS to the applicant"}>
                  <Mail className="size-4 mr-1.5" /> {locale?.t("reviewer.resendNotification", "Resend notification") ?? "Resend notification"}
                </Button>
              )}
              <Button variant="ghost" disabled={actionBusy} onClick={refreshAll}>
                {locale?.t("actions.refresh", "Refresh") ?? "Refresh"}
              </Button>
            </div>
            <div className="flex w-full items-center justify-between gap-2 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="flex-1 sm:flex-none">
                    <ListChecks className="size-4 mr-1.5" /> {locale?.t("reviewer.queue", "Queue") ?? "Queue"}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[92vw] max-w-sm p-0">
                  <SheetHeader className="border-b border-border p-4 text-left">
                    <SheetTitle>{locale?.t("reviewer.queueHeading", "Review queue") ?? "Review queue"}</SheetTitle>
                  </SheetHeader>
                  <div className="p-4 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-tertiary" />
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8 h-9 bg-surface" placeholder={locale?.t("reviewer.searchQueue", "Search queue") ?? "Search queue"} />
                    </div>
                  </div>
                  <div className="overflow-y-auto">
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
                            <div className="text-sm font-medium truncate">{entry.applicant_display_name || formatPersonName(entry.first_name, entry.last_name)}</div>
                            <div className="text-[11px] text-tertiary mt-1 truncate">
                              {(entry.application_display_id || entry.id)} · {entry.tournament_name}
                            </div>
                          </div>
                          <StatusPill status={entry.status} size="xs" />
                        </div>
                      </button>
                    ))}
                    {hasMoreQueue ? (
                      <div className="p-4">
                        <Button variant="outline" className="w-full" onClick={loadMoreQueue} disabled={loadingMoreQueue}>
                          {loadingMoreQueue ? "Loading..." : "Load more"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </SheetContent>
              </Sheet>
              {user?.role === "admin" ? (
                <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setScannerOpen(true)}>
                  <QrCode className="size-4 mr-1.5" /> {locale?.t("reviewer.verifyQr", "Verify QR") ?? "Verify QR"}
                </Button>
              ) : null}
              <Button variant="ghost" className="flex-1 sm:flex-none" disabled={actionBusy} onClick={refreshAll}>
                {locale?.t("actions.refresh", "Refresh") ?? "Refresh"}
              </Button>
            </div>
          </div>
        </header>

        <div className="p-3 sm:p-6 space-y-4 sm:space-y-5 pb-40 md:pb-24 lg:pb-6">
          <CredentialCard
            applicationDisplayId={activeApplication.application_display_id || activeApplication.id}
            applicantName={activeApplication.applicant_display_name || formatPersonName(activeApplication.first_name, activeApplication.last_name)}
            clubName={activeApplication.club_name}
            category={activeApplication.form_data?.selectedDisciplines?.join(" / ") || activeApplication.discipline}
            status={activeApplication.status}
            identityBlocks={[
              { label: "Full Name", value: activeApplication.applicant_display_name || formatPersonName(activeApplication.first_name, activeApplication.last_name) },
              { label: "Application ID", value: activeApplication.application_display_id || activeApplication.id },
              { label: "Weight class", value: activeApplication.weight_class || "—" },
              { label: "Weight", value: activeApplication.weight_kg ? `${activeApplication.weight_kg} kg` : "—" },
            ]}
            verifyUrl={typeof window !== "undefined" ? `${window.location.origin}/verify/${activeApplication.application_display_id || activeApplication.id}` : undefined}
            signatureShortId={(activeApplication.id || "").slice(-8).toUpperCase()}
            portraitUrl={resolveBackendUrl((activeApplication.documents || []).find((doc) => doc.kind === "photo_id")?.url || "") || null}
          />

          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-display text-lg sm:text-xl font-semibold tracking-tight">{locale?.t("reviewer.credentialPreview", "Printable credential preview") ?? "Printable credential preview"}</h3>
                <p className="text-sm text-secondary-muted mt-1">{locale?.t("reviewer.credentialPreviewHelper", "Live view of the Primal OS application PDF — matches exactly what prints.") ?? "Live view of the Primal OS application PDF — matches exactly what prints."}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => api.downloadApplicationPdf(activeApplication.id)}
              >
                <Camera className="size-4 mr-1.5" /> {locale?.t("reviewer.downloadPdf", "Download PDF") ?? "Download PDF"}
              </Button>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
              {pdfPreviewError ? (
                <div className="flex h-[60vh] sm:h-[70vh] w-full items-center justify-center p-6 text-center text-sm text-secondary-muted">
                  {pdfPreviewError}. {locale?.t("reviewer.usePdfInstead", "Use") ?? "Use"} <span className="mx-1 font-medium">{locale?.t("reviewer.downloadPdf", "Download PDF") ?? "Download PDF"}</span> {locale?.t("reviewer.instead", "instead") ?? "instead"}.
                </div>
              ) : pdfPreviewUrl ? (
                <iframe
                  key={activeApplication.id}
                  title={`Application PDF preview for ${activeApplication.application_display_id || activeApplication.id}`}
                  src={`${pdfPreviewUrl}#toolbar=0&navpanes=0`}
                  className="h-[60vh] sm:h-[70vh] w-full"
                />
              ) : (
                <div className="flex h-[60vh] sm:h-[70vh] w-full items-center justify-center p-6 text-center text-sm text-secondary-muted">
                  {locale?.t("reviewer.loadingCredentialPreview", "Loading credential preview\u2026") ?? "Loading credential preview\u2026"}
                </div>
              )}
            </div>
          </section>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4 sm:space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg sm:text-xl font-semibold tracking-tight">{locale?.t("reviewer.disciplineEntry", "Discipline entry") ?? "Discipline entry"}</h3>
                {user?.role === "admin" && activeApplication?.status !== "season_closed" ? (
                  <Button size="sm" variant="outline" onClick={openAdminEdit}>
                    {locale?.t("reviewer.adminEdit.button", "Edit application") ?? "Edit application"}
                  </Button>
                ) : null}
              </div>
              <Separator className="my-4" />
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <Detail label={locale?.t("fields.discipline", "Discipline") ?? "Discipline"} value={activeApplication.discipline || "-"} />
                <Detail label={locale?.t("reviewer.detail.selectedDisciplines", "Selected disciplines") ?? "Selected disciplines"} value={activeApplication.form_data?.selectedDisciplines?.join(", ") || activeApplication.discipline || "-"} />
                <Detail label={locale?.t("fields.tournament", "Tournament") ?? "Tournament"} value={activeApplication.tournament_name || "-"} />
                <Detail label={locale?.t("reviewer.detail.weightClass", "Weight class") ?? "Weight class"} value={activeApplication.weight_class || "-"} />
                <Detail label={locale?.t("fields.weight", "Weight") ?? "Weight"} value={activeApplication.weight_kg ? `${activeApplication.weight_kg} kg` : "-"} />
                <Detail label={locale?.t("fields.reviewer", "Reviewer") ?? "Reviewer"} value={activeApplication.reviewer_display_id || (locale?.t("reviewer.detail.unassigned", "Unassigned") ?? "Unassigned")} />
                <Detail label={locale?.t("fields.submitted", "Submitted") ?? "Submitted"} value={activeApplication.submitted_at ? new Date(activeApplication.submitted_at).toLocaleString() : "-"} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <Swords className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-lg sm:text-xl font-semibold tracking-tight">{locale?.t("reviewer.reviewTimeline", "Review timeline") ?? "Review timeline"}</h3>
                  <p className="text-sm text-secondary-muted mt-2">
                    {locale?.t("reviewer.reviewTimelineHelper", "Full event log for auditability from creation to current state.") ?? "Full event log for auditability from creation to current state."}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {(activeApplication.statusEvents || []).map((event) => (
                  <div key={event.id} className="rounded-xl border border-border bg-background/60 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{event.from_status || "-"} to {event.to_status}</span>
                      <span className="text-xs text-tertiary">{new Date(event.created_at).toLocaleString()}</span>
                    </div>
                    {event.reason && <div className="mt-1 text-secondary-muted">{event.reason}</div>}
                  </div>
                ))}
                {!activeApplication.statusEvents?.length && <div className="text-sm text-secondary-muted">{locale?.t("reviewer.noTimelineEvents", "No timeline events recorded yet.") ?? "No timeline events recorded yet."}</div>}
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="font-display text-lg sm:text-xl font-semibold tracking-tight">{locale?.t("reviewer.participantDetails", "Participant details") ?? "Participant details"}</h3>
              <Separator className="my-4" />
              <div className="space-y-3 text-sm">
                <Detail label={locale?.t("fields.club", "Club") ?? "Club"} value={activeApplication.club_name || (locale?.t("fields.individual", "Individual") ?? "Individual")} />
                <Detail label={locale?.t("fields.applicant", "Applicant") ?? "Applicant"} value={activeApplication.applicant_display_name || formatPersonName(activeApplication.first_name, activeApplication.last_name)} />
                <Detail label={locale?.t("reviewer.detail.applicationId", "Application ID") ?? "Application ID"} value={activeApplication.application_display_id || activeApplication.id} />
                <Detail label={locale?.t("reviewer.detail.correctionDue", "Correction due") ?? "Correction due"} value={activeApplication.correction_due_at ? new Date(activeApplication.correction_due_at).toLocaleString() : "-"} />
                <Detail label={locale?.t("reviewer.detail.rejectionReason", "Rejection reason") ?? "Rejection reason"} value={activeApplication.rejection_reason || "-"} />
                <Detail label={locale?.t("reviewer.detail.reopenReason", "Reopen reason") ?? "Reopen reason"} value={activeApplication.reopen_reason || "-"} />
                <Detail label={locale?.t("fields.decidedAt", "Decided at") ?? "Decided at"} value={activeApplication.decided_at ? new Date(activeApplication.decided_at).toLocaleString() : "-"} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
              <h3 className="font-display text-lg sm:text-xl font-semibold tracking-tight">{locale?.t("reviewer.documentsAndChecks", "Documents and checks") ?? "Documents and checks"}</h3>
              <Separator className="my-4" />
              <div className="space-y-3 text-sm">
                <CheckRow ok={hasRequiredDocs} label={locale?.t("reviewer.checks.requiredUploaded", "Required documents uploaded") ?? "Required documents uploaded"} />
                <CheckRow ok={!!activeApplication.reviewer_id} label={locale?.t("reviewer.checks.reviewerAssigned", "Reviewer assigned") ?? "Reviewer assigned"} />
                <CheckRow ok={activeApplication.status !== "draft"} label={locale?.t("reviewer.checks.submitted", "Application submitted") ?? "Application submitted"} />
                <CheckRow ok={activeApplication.status !== "needs_correction"} label={locale?.t("reviewer.checks.noOpenCorrection", "No open correction request") ?? "No open correction request"} />
              </div>
              <div className="mt-4 space-y-3">
                {(activeApplication.documents || []).map((doc) => (
                  <DocumentReviewRow
                    key={doc.id}
                    doc={doc}
                    busy={actionBusy}
                    canVerify={user?.role === "admin" || user?.role === "reviewer"}
                    onVerify={(verified, reason) => handleDocumentVerify(doc.id, verified, reason)}
                  />
                ))}
                {!activeApplication.documents?.length && <div className="text-sm text-secondary-muted">{locale?.t("reviewer.noDocuments", "No documents uploaded yet.") ?? "No documents uploaded yet."}</div>}
              </div>
            </section>
          </div>
        </div>
        </div>
        <StickyActionBar className="lg:hidden">
          {user?.role === "admin" ? (
            <Button variant="outline" className="flex-1" onClick={() => setScannerOpen(true)}>
              <QrCode className="size-4 mr-1.5" /> {locale?.t("reviewer.verifyQr", "Verify QR") ?? "Verify QR"}
            </Button>
          ) : null}
          {activeApplication.status === "submitted" && (
            <Button variant="outline" className="flex-1" disabled={actionBusy} onClick={handleStartReview}>
              <RefreshCcw className="size-4 mr-1.5" /> {locale?.t("reviewer.startReview", "Start review") ?? "Start review"}
            </Button>
          )}
          {canDecide && (
            <Button variant="outline" className="flex-1" disabled={actionBusy} onClick={() => openReviewDialog("request_correction")}>
              <FileWarning className="size-4 mr-1.5" /> {locale?.t("reviewer.correction", "Correction") ?? "Correction"}
            </Button>
          )}
          {canDecide && (
            <Button variant="outline" className="flex-1" disabled={actionBusy} onClick={() => openReviewDialog("reject")}>
              <XCircle className="size-4 mr-1.5" /> {locale?.t("reviewer.reject", "Reject") ?? "Reject"}
            </Button>
          )}
          {canDecide && (
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionBusy} onClick={() => openReviewDialog("approve")}>
              <CheckCircle2 className="size-4 mr-1.5" /> {locale?.t("reviewer.approve", "Approve") ?? "Approve"}
            </Button>
          )}
          {canReopen && (
            <Button variant="outline" className="flex-1" disabled={actionBusy} onClick={() => openReviewDialog("reopen")}>
              <Undo2 className="size-4 mr-1.5" /> {locale?.t("reviewer.reopen", "Reopen") ?? "Reopen"}
            </Button>
          )}
          {["approved", "rejected", "needs_correction"].includes(activeApplication.status) && (
            <Button variant="outline" className="flex-1" disabled={actionBusy} onClick={handleResendNotification}>
              <Mail className="size-4 mr-1.5" /> {locale?.t("reviewer.resendNotification", "Resend") ?? "Resend"}
            </Button>
          )}
        </StickyActionBar>
          </>
        )}
      </section>
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="w-full max-w-md p-0 sm:max-w-md sm:rounded-3xl border-border max-h-[92dvh] overflow-y-auto rounded-3xl">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="size-5 text-primary" /> {locale?.t("reviewer.qr.title", "Verify printed application") ?? "Verify printed application"}
            </DialogTitle>
            <DialogDescription>
              {locale?.t("reviewer.qr.description", "Scan the QR code from the printed application PDF to verify the signature and open the matching record.") ?? "Scan the QR code from the printed application PDF to verify the signature and open the matching record."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <LiveQrScanner
              active={scannerOpen}
              onScan={(value) => verifyScannedCode(value)}
              onError={(message) => setScannerError(message)}
            />
            {scannerBusy ? (
              <div className="rounded-2xl border border-border bg-surface-muted/40 px-4 py-3 text-sm text-secondary-muted">
                Verifying scanned application...
              </div>
            ) : null}
            {scannerError || (scannerResult && !scannerResult.valid) ? (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary">{locale?.t("reviewer.qr.pasteUrl", "Paste verification URL") ?? "Paste verification URL"}</div>
              <Input
                value={scannedValue}
                onChange={(event) => setScannedValue(event.target.value)}
                placeholder="https://.../api/public/verify/application-signature?aid=..."
                className="bg-surface"
              />
              <Button type="button" className="w-full" onClick={() => verifyScannedCode(scannedValue)} disabled={!scannedValue.trim() || scannerBusy}>
                {locale?.t("reviewer.qr.verifyCode", "Verify code") ?? "Verify code"}
              </Button>
            </div>
            ) : null}
            {scannerError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {scannerError}
              </div>
            ) : null}
            {scannerResult ? (
              <div className={`rounded-2xl border px-4 py-4 text-sm ${scannerResult.valid ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30" : "border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/30"}`}>
                <div className="font-semibold">
                  {scannerResult.valid
                    ? (locale?.t("reviewer.qr.signatureVerified", "Signature verified") ?? "Signature verified")
                    : (locale?.t("reviewer.qr.signatureFailed", "Signature check failed") ?? "Signature check failed")}
                </div>
                <div className="mt-1 text-secondary-muted">{scannerResult.reason}</div>
                {scannerResult.application ? (
                  <div className="mt-3 space-y-1">
                    <div>{scannerResult.application.applicant}</div>
                    <div className="text-secondary-muted">{scannerResult.application.tournament}</div>
                    <div className="text-secondary-muted">Record: {scannerResult.application.displayId || scannerResult.application.id}</div>
                    <div className="text-secondary-muted">Status: {scannerResult.application.status}</div>
                  </div>
                ) : null}
                {scannerResult.valid && scannerResult.application?.id ? (
                  <Button type="button" className="mt-4 w-full" onClick={openVerifiedApplication}>
                    {locale?.t("reviewer.qr.openVerified", "Open verified application") ?? "Open verified application"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={reviewDialog.open} onOpenChange={(open) => !open && closeReviewDialog()}>
        <DialogContent className="max-w-lg sm:rounded-3xl border-border max-h-[92dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {reviewDialog.action === "reopen"
                ? (locale?.t("reviewer.dialog.reopenTitle", "Reopen application") ?? "Reopen application")
                : reviewDialog.action === "request_correction"
                  ? (locale?.t("reviewer.dialog.correctionTitle", "Request correction") ?? "Request correction")
                  : (locale?.t("reviewer.dialog.rejectTitle", "Reject application") ?? "Reject application")}
            </DialogTitle>
            <DialogDescription>
              {reviewDialog.action === "reopen"
                ? (locale?.t("reviewer.dialog.reopenDescription", "Provide the reopen reason before moving this record back to under review.") ?? "Provide the reopen reason before moving this record back to under review.")
                : reviewDialog.action === "request_correction"
                  ? (locale?.t("reviewer.dialog.correctionDescription", "Record the correction reason and the fields the applicant must update.") ?? "Record the correction reason and the fields the applicant must update.")
                  : (locale?.t("reviewer.dialog.rejectDescription", "Record the rejection reason for the audit log and notification trail.") ?? "Record the rejection reason for the audit log and notification trail.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary">{locale?.t("reviewer.dialog.reason", "Reason") ?? "Reason"}</div>
              <Textarea
                rows={3}
                value={reviewDialog.reason}
                onChange={(event) => setReviewDialog((current) => ({ ...current, reason: event.target.value }))}
                className="bg-surface"
                placeholder={locale?.t("reviewer.dialog.reasonPlaceholder", "Tell the applicant what needs to change") ?? "Tell the applicant what needs to change"}
              />
            </div>
            {reviewDialog.action === "request_correction" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary">{locale?.t("reviewer.dialog.fields", "Fields to correct") ?? "Fields to correct"}</div>
                  <div className="text-[10px] text-tertiary">Tap to toggle. The applicant&apos;s edit form will highlight these.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CORRECTION_FIELD_OPTIONS.map((option) => {
                    const tokens = parseFieldTokens(reviewDialog.fields);
                    const selected = tokens.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setReviewDialog((current) => ({
                          ...current,
                          fields: serializeFieldTokens(
                            selected
                              ? parseFieldTokens(current.fields).filter((token) => token !== option.id)
                              : [...parseFieldTokens(current.fields), option.id]
                          ),
                        }))}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? "border-amber-500 bg-amber-100 text-amber-900"
                            : "border-border bg-surface text-secondary-muted hover:bg-surface-muted"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <Input
                  value={reviewDialog.fields}
                  onChange={(event) => setReviewDialog((current) => ({ ...current, fields: event.target.value }))}
                  className="bg-surface text-xs font-mono"
                  placeholder="weightKg, emergencyContactPhone"
                />
                <div className="text-[10px] text-tertiary">
                  Need a custom field? Type its key here (camelCase or snake_case both work).
                </div>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeReviewDialog}>{locale?.t("actions.cancel", "Cancel") ?? "Cancel"}</Button>
              <Button onClick={handleConfirmReviewDialog} disabled={actionBusy || !reviewDialog.reason.trim()}>
                {reviewDialog.action === "reopen"
                  ? (locale?.t("reviewer.reopen", "Reopen") ?? "Reopen")
                  : reviewDialog.action === "request_correction"
                    ? (locale?.t("reviewer.dialog.sendCorrection", "Send correction") ?? "Send correction")
                    : (locale?.t("reviewer.reject", "Reject") ?? "Reject")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={adminEditOpen} onOpenChange={setAdminEditOpen}>
        <DialogContent className="max-w-3xl border-border max-h-[92dvh] overflow-y-auto rounded-2xl sm:rounded-3xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{locale?.t("reviewer.adminEdit.title", "Correct application on behalf of applicant") ?? "Correct application on behalf of applicant"}</DialogTitle>
            <DialogDescription>{locale?.t("reviewer.adminEdit.desc", "Saves form data without changing application status. Use this to fix typos or selections an applicant cannot self-correct in time.") ?? "Saves form data without changing application status. Use this to fix typos or selections an applicant cannot self-correct in time."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {Array.isArray(activeApplication?.correction_fields) && activeApplication.correction_fields.length ? (
              <div className="rounded-lg border border-amber-300/60 bg-amber-50/40 p-3 text-xs text-amber-900">
                <span className="font-medium">Reviewer-flagged fields:</span>{" "}
                {activeApplication.correction_fields.map((f) => (
                  <span key={f} className="ml-1 inline-block rounded-full bg-amber-100/80 px-2 py-0.5 capitalize">{String(f).replace(/_/g, " ")}</span>
                ))}
              </div>
            ) : null}
            <ApplicationFormEditor
              mode="admin"
              formDataValue={adminEditDraft}
              onFormDataChange={setAdminEditDraft}
              flaggedFields={activeApplication?.correction_fields}
              idPrefix={activeApplication ? `admin-edit-${activeApplication.id}` : "admin-edit"}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAdminEditOpen(false)} disabled={adminEditSaving}>{locale?.t("actions.cancel", "Cancel") ?? "Cancel"}</Button>
              <Button onClick={saveAdminEdit} disabled={adminEditSaving}>
                {adminEditSaving ? (locale?.t("actions.saving", "Saving...") ?? "Saving...") : (locale?.t("actions.save", "Save") ?? "Save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

function DocumentReviewRow({ doc, busy, canVerify, onVerify }) {
  const locale = useLocale();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const docUrl = resolveBackendUrl(doc.url);
  const isImage = (doc.mime_type || "").startsWith("image/");
  const isPdf = (doc.mime_type || "") === "application/pdf";
  const verified = !!doc.verified_at;
  const rejected = !verified && !!doc.verify_reason;
  const expiringClass = doc.expires_on
    ? new Date(doc.expires_on) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      ? "text-orange-600"
      : ""
    : "";

  return (
    <div className={`rounded-xl border ${verified ? "border-emerald-300/60" : rejected ? "border-rose-300/60" : "border-border"} bg-background/60 p-3 text-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium capitalize">{(doc.kind || "document").replace(/_/g, " ")}</div>
          <div className="text-xs text-tertiary mt-0.5 truncate">{doc.original_filename || doc.label || doc.storage_key}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wider">
            {doc.captured_via === "scan" ? <span className="rounded bg-foreground/10 px-1.5 py-0.5">{locale?.t("reviewer.doc.scanned", "scanned") ?? "scanned"}</span> : null}
            {doc.captured_via === "admin_rescan" ? <span className="rounded bg-foreground/10 px-1.5 py-0.5">{locale?.t("reviewer.doc.adminScan", "admin scan") ?? "admin scan"}</span> : null}
            {verified ? <span className="rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5">{locale?.t("reviewer.doc.verified", "verified") ?? "verified"}</span> : null}
            {rejected ? <span className="rounded bg-rose-500/15 text-rose-700 px-1.5 py-0.5">{locale?.t("reviewer.doc.rejected", "rejected") ?? "rejected"}</span> : null}
            {doc.expires_on ? <span className={`rounded bg-foreground/5 px-1.5 py-0.5 ${expiringClass}`}>{locale?.t("reviewer.doc.expPrefix", "exp") ?? "exp"} {String(doc.expires_on).slice(0, 10)}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen((v) => !v)}>{previewOpen ? (locale?.t("reviewer.doc.hide", "Hide") ?? "Hide") : (locale?.t("reviewer.doc.preview", "Preview") ?? "Preview")}</Button>
          <a href={docUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-muted/40">{locale?.t("reviewer.doc.open", "Open") ?? "Open"}</a>
        </div>
      </div>

      {previewOpen ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-black/5">
          {isImage ? (
            <img src={docUrl} alt={doc.kind} className="block max-h-[420px] w-full object-contain bg-white" />
          ) : isPdf ? (
            <iframe src={`${docUrl}#toolbar=0&navpanes=0`} title={doc.kind} className="block h-[420px] w-full bg-white" />
          ) : (
            <div className="p-4 text-xs text-tertiary">{locale?.t("reviewer.doc.previewUnavailable", "Preview not available for this file type.") ?? "Preview not available for this file type."}</div>
          )}
        </div>
      ) : null}

      {canVerify ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={verified ? "outline" : "default"}
            disabled={busy}
            onClick={() => onVerify(true)}
          >
            <CheckCircle2 className="size-3.5 mr-1" /> {verified ? (locale?.t("reviewer.doc.alreadyVerified", "Verified") ?? "Verified") : (locale?.t("reviewer.doc.verify", "Verify") ?? "Verify")}
          </Button>
          <Input
            value={rejectReason}
            placeholder={locale?.t("reviewer.doc.rejectPlaceholder", "Reject reason (e.g., blurry, expired)") ?? "Reject reason (e.g., blurry, expired)"}
            onChange={(event) => setRejectReason(event.target.value)}
            className="h-8 max-w-[220px] bg-surface text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !rejectReason.trim()}
            onClick={() => onVerify(false, rejectReason.trim())}
          >
            <XCircle className="size-3.5 mr-1" /> {locale?.t("reviewer.reject", "Reject") ?? "Reject"}
          </Button>
          {rejected ? <span className="text-xs text-rose-600">{doc.verify_reason}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
