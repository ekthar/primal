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
import { Separator } from "@/components/ui/separator";
import StatusPill from "@/components/shared/StatusPill";
import CredentialCard from "@/components/shared/CredentialCard";
import EmptyState from "@/components/shared/EmptyState";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { StickyActionBar } from "@/components/shared/ResponsivePrimitives";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import api, { isApiLive, resolveBackendUrl } from "@/lib/api";
import { formatPersonName } from "@/lib/person";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function ReviewerWorkbench() {
  const { user } = useAuth();
  const router = useRouter();
  const routeId = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;
  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(routeId || null);
  const [activeApplication, setActiveApplication] = useState(null);
  const [loadingApplication, setLoadingApplication] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerSupported, setScannerSupported] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerResult, setScannerResult] = useState(null);
  const [scannedValue, setScannedValue] = useState("");
  const [reviewDialog, setReviewDialog] = useState({ open: false, action: null, reason: "", fields: "" });
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfPreviewError, setPdfPreviewError] = useState(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const frameRequestRef = useRef(null);

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
    const supported = typeof window !== "undefined" && "BarcodeDetector" in window && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    setScannerSupported(supported);
  }, []);

  useEffect(() => {
    isApiLive().then((live) => {
      if (!live) {
        const marker = "review-workbench-api-unreachable-toast-shown";
        if (typeof window !== "undefined" && !window.sessionStorage.getItem(marker)) {
          window.sessionStorage.setItem(marker, "1");
          toast.error("Backend API is not reachable. Review actions will fail until the API is back online.");
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      setScannerError("");
      setScannerBusy(false);
      return;
    }

    if (!scannerSupported) {
      setScannerError("Live camera scanning is not supported on this device. Paste the QR verification URL instead.");
      return;
    }

    startScanner();

    return () => {
      stopScanner();
    };
  }, [scannerOpen, scannerSupported]);

  async function loadQueue() {
    setLoadingQueue(true);
    const { data, error } = await api.queueBoard({ status: "all", q: search || undefined, limit: 200, offset: 0 });
    setLoadingQueue(false);
    if (error) {
      toast.error(error.message || "Failed to load reviewer queue");
      return;
    }
    const items = data.items || [];
    setQueue(items);
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

  function stopScanner() {
    if (frameRequestRef.current) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function startScanner() {
    stopScanner();
    setScannerError("");
    setScannerResult(null);
    setScannerBusy(true);

    try {
      if (!detectorRef.current) {
        detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScannerBusy(false);
      frameRequestRef.current = requestAnimationFrame(scanVideoFrame);
    } catch (error) {
      setScannerBusy(false);
      setScannerError(error.message || "Unable to start the camera scanner.");
    }
  }

  async function scanVideoFrame() {
    if (!videoRef.current || !detectorRef.current) return;

    try {
      const barcodes = await detectorRef.current.detect(videoRef.current);
      if (barcodes.length > 0 && barcodes[0].rawValue) {
        await verifyScannedCode(barcodes[0].rawValue);
        return;
      }
    } catch (error) {
      setScannerError(error.message || "Failed to read the QR code.");
      return;
    }

    frameRequestRef.current = requestAnimationFrame(scanVideoFrame);
  }

  async function verifyScannedCode(rawValue) {
    stopScanner();
    setScannerBusy(true);
    setScannerError("");
    setScannedValue(rawValue);

    let verificationUrl;
    try {
      verificationUrl = new URL(rawValue, window.location.origin);
    } catch (_error) {
      setScannerBusy(false);
      setScannerError("The scanned QR code is not a valid verification URL.");
      return;
    }

    if (!verificationUrl.pathname.includes("/api/public/verify/application-signature")) {
      setScannerBusy(false);
      setScannerError("This QR code is not a Primal application verification code.");
      return;
    }

    const { data, error } = await api.verifyApplicationSignatureUrl(verificationUrl.toString());
    setScannerBusy(false);
    if (error) {
      setScannerResult(null);
      setScannerError(error.message || error.reason || "Verification failed.");
      return;
    }

    setScannerResult(data);
  }

  async function handleQrPhotoSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;
    if (!scannerSupported || !detectorRef.current) {
      setScannerError("Photo QR decoding is not supported on this device. Paste the verification URL instead.");
      return;
    }

    try {
      setScannerBusy(true);
      setScannerError("");
      const imageBitmap = await createImageBitmap(file);
      const barcodes = await detectorRef.current.detect(imageBitmap);
      if (!barcodes.length || !barcodes[0].rawValue) {
        setScannerBusy(false);
        setScannerError("No QR code was found in that image.");
        return;
      }
      await verifyScannedCode(barcodes[0].rawValue);
    } catch (error) {
      setScannerBusy(false);
      setScannerError(error.message || "Failed to scan the QR photo.");
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
      fields: action === "request_correction" ? "medical,weight_class" : "",
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
      channels: ["email", "whatsapp", "sms"],
      reason: activeApplication.review_notes || activeApplication.rejection_reason || "",
    });
    setActionBusy(false);
    if (error) {
      toast.error(error.message || "Failed to resend notification");
      return;
    }
    toast.success("Notification dispatched (email + SMS fallback)");
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
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Participant review</div>
          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-tertiary" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8 h-9 bg-surface" placeholder="Search queue" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingQueue && (
            <div className="p-4">
              <SectionLoader
                title="Loading review queue"
                description="Fetching the next applications that need a reviewer decision."
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
        </div>
      </aside>

      <section className="flex-1 overflow-y-auto">
        {!activeApplication || loadingApplication ? (
          <div className="p-6">
            <SectionLoader
              title="Loading application details"
              description="Pulling the latest fighter profile, documents, and audit timeline."
              cards={2}
              rows={4}
              compact
            />
          </div>
        ) : (
          <>
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="px-6 py-5 flex items-center gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-tertiary">
                <span className="font-mono">{activeApplication.application_display_id || activeApplication.id}</span>
                <ChevronRight className="size-3" />
                <span>{activeApplication.tournament_name}</span>
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight mt-1">
                {activeApplication.applicant_display_name || formatPersonName(activeApplication.first_name, activeApplication.last_name)}
              </h2>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <StatusPill status={activeApplication.status} />
                <span className="text-xs text-tertiary">{activeApplication.club_name || "Individual applicant"}</span>
              </div>
            </div>
            <div className="hidden lg:flex items-center gap-2">
              {activeApplication.status === "submitted" && (
                <Button variant="outline" disabled={actionBusy} onClick={handleStartReview}>
                  <RefreshCcw className="size-4 mr-1.5" /> Start review
                </Button>
              )}
              {canDecide && (
                <Button variant="outline" disabled={actionBusy} onClick={() => openReviewDialog("request_correction")}>
                  <FileWarning className="size-4 mr-1.5" /> Correction
                </Button>
              )}
              {canDecide && (
                <Button variant="outline" disabled={actionBusy} onClick={() => openReviewDialog("reject")}>
                  <XCircle className="size-4 mr-1.5" /> Reject
                </Button>
              )}
              {canDecide && (
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionBusy} onClick={() => openReviewDialog("approve")}>
                  <CheckCircle2 className="size-4 mr-1.5" /> Approve
                </Button>
              )}
              {canReopen && (
                <Button variant="outline" disabled={actionBusy} onClick={() => openReviewDialog("reopen")}>
                  <Undo2 className="size-4 mr-1.5" /> Reopen
                </Button>
              )}
              {["approved", "rejected", "needs_correction"].includes(activeApplication.status) && (
                <Button variant="outline" disabled={actionBusy} onClick={handleResendNotification} title="Resend decision email + SMS to the applicant">
                  <Mail className="size-4 mr-1.5" /> Resend notification
                </Button>
              )}
              <Button variant="ghost" disabled={actionBusy} onClick={refreshAll}>
                Refresh
              </Button>
            </div>
            <div className="flex w-full items-center justify-between gap-2 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="flex-1 sm:flex-none">
                    <ListChecks className="size-4 mr-1.5" /> Queue
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[92vw] max-w-sm p-0">
                  <SheetHeader className="border-b border-border p-4 text-left">
                    <SheetTitle>Review queue</SheetTitle>
                  </SheetHeader>
                  <div className="p-4 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-tertiary" />
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8 h-9 bg-surface" placeholder="Search queue" />
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
                  </div>
                </SheetContent>
              </Sheet>
              {user?.role === "admin" ? (
                <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setScannerOpen(true)}>
                  <QrCode className="size-4 mr-1.5" /> Verify QR
                </Button>
              ) : null}
              <Button variant="ghost" className="flex-1 sm:flex-none" disabled={actionBusy} onClick={refreshAll}>
                Refresh
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-5">
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

          <section className="rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">Printable credential preview</h3>
                <p className="text-sm text-secondary-muted mt-1">Live view of the Primal OS application PDF — matches exactly what prints.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => api.downloadApplicationPdf(activeApplication.id)}
              >
                <Camera className="size-4 mr-1.5" /> Download PDF
              </Button>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
              {pdfPreviewError ? (
                <div className="flex h-[70vh] w-full items-center justify-center p-6 text-center text-sm text-secondary-muted">
                  {pdfPreviewError}. Use <span className="mx-1 font-medium">Download PDF</span> instead.
                </div>
              ) : pdfPreviewUrl ? (
                <iframe
                  key={activeApplication.id}
                  title={`Application PDF preview for ${activeApplication.application_display_id || activeApplication.id}`}
                  src={`${pdfPreviewUrl}#toolbar=0&navpanes=0`}
                  className="h-[70vh] w-full"
                />
              ) : (
                <div className="flex h-[70vh] w-full items-center justify-center p-6 text-center text-sm text-secondary-muted">
                  Loading credential preview…
                </div>
              )}
            </div>
          </section>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight">Discipline entry</h3>
              <Separator className="my-4" />
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <Detail label="Discipline" value={activeApplication.discipline || "-"} />
                <Detail label="Selected disciplines" value={activeApplication.form_data?.selectedDisciplines?.join(", ") || activeApplication.discipline || "-"} />
                <Detail label="Tournament" value={activeApplication.tournament_name || "-"} />
                <Detail label="Weight class" value={activeApplication.weight_class || "-"} />
                <Detail label="Weight" value={activeApplication.weight_kg ? `${activeApplication.weight_kg} kg` : "-"} />
                <Detail label="Reviewer" value={activeApplication.reviewer_display_id || "Unassigned"} />
                <Detail label="Submitted" value={activeApplication.submitted_at ? new Date(activeApplication.submitted_at).toLocaleString() : "-"} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-start gap-3">
                <Swords className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-xl font-semibold tracking-tight">Review timeline</h3>
                  <p className="text-sm text-secondary-muted mt-2">
                    Full event log for auditability from creation to current state.
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
                {!activeApplication.statusEvents?.length && <div className="text-sm text-secondary-muted">No timeline events recorded yet.</div>}
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight">Participant details</h3>
              <Separator className="my-4" />
              <div className="space-y-3 text-sm">
                <Detail label="Club" value={activeApplication.club_name || "Individual"} />
                <Detail label="Applicant" value={activeApplication.applicant_display_name || formatPersonName(activeApplication.first_name, activeApplication.last_name)} />
                <Detail label="Application ID" value={activeApplication.application_display_id || activeApplication.id} />
                <Detail label="Correction due" value={activeApplication.correction_due_at ? new Date(activeApplication.correction_due_at).toLocaleString() : "-"} />
                <Detail label="Rejection reason" value={activeApplication.rejection_reason || "-"} />
                <Detail label="Reopen reason" value={activeApplication.reopen_reason || "-"} />
                <Detail label="Decided at" value={activeApplication.decided_at ? new Date(activeApplication.decided_at).toLocaleString() : "-"} />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight">Documents and checks</h3>
              <Separator className="my-4" />
              <div className="space-y-3 text-sm">
                <CheckRow ok={hasRequiredDocs} label="Required documents uploaded" />
                <CheckRow ok={!!activeApplication.reviewer_id} label="Reviewer assigned" />
                <CheckRow ok={activeApplication.status !== "draft"} label="Application submitted" />
                <CheckRow ok={activeApplication.status !== "needs_correction"} label="No open correction request" />
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
                {!activeApplication.documents?.length && <div className="text-sm text-secondary-muted">No documents uploaded yet.</div>}
              </div>
            </section>
          </div>
        </div>
        </div>
        <StickyActionBar className="lg:hidden">
          {user?.role === "admin" ? (
            <Button variant="outline" className="flex-1" onClick={() => setScannerOpen(true)}>
              <QrCode className="size-4 mr-1.5" /> Verify QR
            </Button>
          ) : null}
          {activeApplication.status === "submitted" && (
            <Button variant="outline" className="flex-1" disabled={actionBusy} onClick={handleStartReview}>
              <RefreshCcw className="size-4 mr-1.5" /> Start review
            </Button>
          )}
          {canDecide && (
            <Button variant="outline" className="flex-1" disabled={actionBusy} onClick={() => openReviewDialog("request_correction")}>
              <FileWarning className="size-4 mr-1.5" /> Correction
            </Button>
          )}
          {canDecide && (
            <Button variant="outline" className="flex-1" disabled={actionBusy} onClick={() => openReviewDialog("reject")}>
              <XCircle className="size-4 mr-1.5" /> Reject
            </Button>
          )}
          {canDecide && (
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionBusy} onClick={() => openReviewDialog("approve")}>
              <CheckCircle2 className="size-4 mr-1.5" /> Approve
            </Button>
          )}
          {canReopen && (
            <Button variant="outline" className="flex-1" disabled={actionBusy} onClick={() => openReviewDialog("reopen")}>
              <Undo2 className="size-4 mr-1.5" /> Reopen
            </Button>
          )}
        </StickyActionBar>
          </>
        )}
      </section>
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="max-w-md rounded-3xl border-border p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="size-5 text-primary" /> Verify printed application
            </DialogTitle>
            <DialogDescription>
              Scan the QR code from the printed application PDF to verify the signature and open the matching record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-surface-muted">
              <video ref={videoRef} className="aspect-square w-full bg-black object-cover" muted playsInline />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={startScanner} disabled={!scannerSupported || scannerBusy}>
                <Camera className="size-4" /> {scannerBusy ? "Starting..." : "Use camera"}
              </Button>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <QrCode className="size-4" /> Scan QR photo
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleQrPhotoSelection}
              className="hidden"
            />
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary">Paste verification URL</div>
              <Input
                value={scannedValue}
                onChange={(event) => setScannedValue(event.target.value)}
                placeholder="https://.../api/public/verify/application-signature?aid=..."
                className="bg-surface"
              />
              <Button type="button" className="w-full" onClick={() => verifyScannedCode(scannedValue)} disabled={!scannedValue.trim() || scannerBusy}>
                Verify code
              </Button>
            </div>
            {scannerError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {scannerError}
              </div>
            ) : null}
            {scannerResult ? (
              <div className={`rounded-2xl border px-4 py-4 text-sm ${scannerResult.valid ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30" : "border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/30"}`}>
                <div className="font-semibold">
                  {scannerResult.valid ? "Signature verified" : "Signature check failed"}
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
                    Open verified application
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={reviewDialog.open} onOpenChange={(open) => !open && closeReviewDialog()}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>
              {reviewDialog.action === "reopen"
                ? "Reopen application"
                : reviewDialog.action === "request_correction"
                  ? "Request correction"
                  : "Reject application"}
            </DialogTitle>
            <DialogDescription>
              {reviewDialog.action === "reopen"
                ? "Provide the reopen reason before moving this record back to under review."
                : reviewDialog.action === "request_correction"
                  ? "Record the correction reason and the fields the applicant must update."
                  : "Record the rejection reason for the audit log and notification trail."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary">Reason</div>
              <Input
                value={reviewDialog.reason}
                onChange={(event) => setReviewDialog((current) => ({ ...current, reason: event.target.value }))}
                className="bg-surface"
                placeholder="Enter reason"
              />
            </div>
            {reviewDialog.action === "request_correction" ? (
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary">Fields to correct</div>
                <Input
                  value={reviewDialog.fields}
                  onChange={(event) => setReviewDialog((current) => ({ ...current, fields: event.target.value }))}
                  className="bg-surface"
                  placeholder="medical,weight_class"
                />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeReviewDialog}>Cancel</Button>
              <Button onClick={handleConfirmReviewDialog} disabled={actionBusy || !reviewDialog.reason.trim()}>
                {reviewDialog.action === "reopen" ? "Reopen" : reviewDialog.action === "request_correction" ? "Send correction" : "Reject"}
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
            {doc.captured_via === "scan" ? <span className="rounded bg-foreground/10 px-1.5 py-0.5">scanned</span> : null}
            {doc.captured_via === "admin_rescan" ? <span className="rounded bg-foreground/10 px-1.5 py-0.5">admin scan</span> : null}
            {verified ? <span className="rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5">verified</span> : null}
            {rejected ? <span className="rounded bg-rose-500/15 text-rose-700 px-1.5 py-0.5">rejected</span> : null}
            {doc.expires_on ? <span className={`rounded bg-foreground/5 px-1.5 py-0.5 ${expiringClass}`}>exp {String(doc.expires_on).slice(0, 10)}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen((v) => !v)}>{previewOpen ? "Hide" : "Preview"}</Button>
          <a href={docUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-muted/40">Open</a>
        </div>
      </div>

      {previewOpen ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-black/5">
          {isImage ? (
            <img src={docUrl} alt={doc.kind} className="block max-h-[420px] w-full object-contain bg-white" />
          ) : isPdf ? (
            <iframe src={`${docUrl}#toolbar=0&navpanes=0`} title={doc.kind} className="block h-[420px] w-full bg-white" />
          ) : (
            <div className="p-4 text-xs text-tertiary">Preview not available for this file type.</div>
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
            <CheckCircle2 className="size-3.5 mr-1" /> {verified ? "Verified" : "Verify"}
          </Button>
          <Input
            value={rejectReason}
            placeholder="Reject reason (e.g., blurry, expired)"
            onChange={(event) => setRejectReason(event.target.value)}
            className="h-8 max-w-[220px] bg-surface text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !rejectReason.trim()}
            onClick={() => onVerify(false, rejectReason.trim())}
          >
            <XCircle className="size-3.5 mr-1" /> Reject
          </Button>
          {rejected ? <span className="text-xs text-rose-600">{doc.verify_reason}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
