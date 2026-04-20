import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  CheckCircle2,
  ChevronRight,
  FileWarning,
  RefreshCcw,
  Search,
  ShieldCheck,
  Swords,
  Undo2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import api from "@/lib/api";
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

  async function handleDecision(action) {
    if (!activeId) return;
    let reason;
    let fields;

    if (action === "reject") {
      reason = window.prompt("Rejection reason", "Eligibility criteria not met");
      if (!reason) return;
    }
    if (action === "request_correction") {
      reason = window.prompt("Correction reason", "Please update required fields");
      if (!reason) return;
      const fieldInput = window.prompt("Fields to correct (comma separated)", "medical,weight_class");
      fields = (fieldInput || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
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

  async function handleReopen() {
    if (!activeId) return;
    const reason = window.prompt("Reopen reason", "Appeal granted");
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
    <div className="flex h-[calc(100vh-0px)] md:h-screen">
      <aside className="hidden lg:flex w-[340px] shrink-0 flex-col border-r border-border bg-surface/40">
        <div className="p-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Participant review</div>
          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-tertiary" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8 h-9 bg-surface" placeholder="Search queue" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingQueue && <div className="px-4 py-3 text-sm text-secondary-muted">Loading queue...</div>}
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
                  <div className="text-sm font-medium truncate">{entry.first_name} {entry.last_name}</div>
                  <div className="text-[11px] text-tertiary mt-1 truncate">
                    {entry.first_name} {entry.last_name} · {entry.tournament_name}
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
          <div className="p-10 text-sm text-secondary-muted">Loading application details...</div>
        ) : (
          <>
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="px-6 py-5 flex items-center gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-tertiary">
                <span className="font-mono">{activeApplication.id}</span>
                <ChevronRight className="size-3" />
                <span>{activeApplication.tournament_name}</span>
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight mt-1">
                {activeApplication.first_name} {activeApplication.last_name}
              </h2>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <StatusPill status={activeApplication.status} />
                <span className="text-xs text-tertiary">{activeApplication.club_name || "Individual applicant"}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeApplication.status === "submitted" && (
                <Button variant="outline" disabled={actionBusy} onClick={handleStartReview}>
                  <RefreshCcw className="size-4 mr-1.5" /> Start review
                </Button>
              )}
              {canDecide && (
                <Button variant="outline" disabled={actionBusy} onClick={() => handleDecision("request_correction")}>
                  <FileWarning className="size-4 mr-1.5" /> Correction
                </Button>
              )}
              {canDecide && (
                <Button variant="outline" disabled={actionBusy} onClick={() => handleDecision("reject")}>
                  <XCircle className="size-4 mr-1.5" /> Reject
                </Button>
              )}
              {canDecide && (
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionBusy} onClick={() => handleDecision("approve")}>
                  <CheckCircle2 className="size-4 mr-1.5" /> Approve
                </Button>
              )}
              {canReopen && (
                <Button variant="outline" disabled={actionBusy} onClick={handleReopen}>
                  <Undo2 className="size-4 mr-1.5" /> Reopen
                </Button>
              )}
              <Button variant="ghost" disabled={actionBusy} onClick={refreshAll}>
                Refresh
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-xl font-semibold tracking-tight">Discipline entry</h3>
              <Separator className="my-4" />
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <Detail label="Discipline" value={activeApplication.discipline || "-"} />
                <Detail label="Tournament" value={activeApplication.tournament_name || "-"} />
                <Detail label="Weight class" value={activeApplication.weight_class || "-"} />
                <Detail label="Weight" value={activeApplication.weight_kg ? `${activeApplication.weight_kg} kg` : "-"} />
                <Detail label="Reviewer" value={activeApplication.reviewer_id || "Unassigned"} />
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
                <Detail label="Applicant" value={`${activeApplication.first_name} ${activeApplication.last_name}`} />
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
              <div className="mt-4 space-y-2">
                {(activeApplication.documents || []).map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-border bg-background/60 p-3 text-sm hover:bg-surface-muted/40"
                  >
                    <div className="font-medium">{doc.kind}</div>
                    <div className="text-xs text-tertiary mt-1">{doc.original_filename || doc.label || doc.storage_key}</div>
                  </a>
                ))}
                {!activeApplication.documents?.length && <div className="text-sm text-secondary-muted">No documents uploaded yet.</div>}
              </div>
            </section>
          </div>
        </div>
          </>
        )}
      </section>
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
