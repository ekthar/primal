import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Weight,
  Trophy,
  Stethoscope,
  Calendar,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import StatusPill from "@/components/shared/StatusPill";
import Timeline from "@/components/shared/Timeline";
import EmptyState from "@/components/shared/EmptyState";
import { FIGHTERS, STATUS } from "@/lib/mockData";
import { toast } from "sonner";

export default function ReviewerWorkbench() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fighters, setFighters] = useState(FIGHTERS);
  const [activeId, setActiveId] = useState(id || fighters[0]?.id);
  const [sideSearch, setSideSearch] = useState("");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionFields, setCorrectionFields] = useState([]);

  useEffect(() => {
    if (id) setActiveId(id);
  }, [id]);

  const active = useMemo(() => fighters.find((f) => f.id === activeId), [fighters, activeId]);

  const queueList = useMemo(() => {
    const q = sideSearch.toLowerCase();
    return fighters
      .filter((f) => [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.NEEDS_CORRECTION].includes(f.status))
      .filter((f) => (q ? f.fullName.toLowerCase().includes(q) || f.clubName.toLowerCase().includes(q) : true));
  }, [fighters, sideSearch]);

  const pick = (fid) => {
    setActiveId(fid);
    navigate(`/admin/review/${fid}`, { replace: true });
  };

  const updateStatus = (newStatus, label, extra) => {
    setFighters((list) =>
      list.map((f) =>
        f.id === activeId
          ? {
              ...f,
              status: newStatus,
              timeline: [
                ...f.timeline,
                {
                  at: new Date().toISOString(),
                  kind: newStatus,
                  label: label || `Status changed to ${newStatus}`,
                  actor: "You",
                },
              ],
              ...extra,
            }
          : f
      )
    );
  };

  const approve = () => {
    updateStatus(STATUS.APPROVED, "Approved for weigh-in");
    toast.success(`${active.fullName} approved`);
  };
  const reject = () => {
    updateStatus(STATUS.REJECTED, "Rejected by reviewer");
    toast.error(`${active.fullName} rejected`);
  };

  const submitCorrection = () => {
    if (!correctionReason.trim()) {
      toast.error("Add a brief reason for the correction");
      return;
    }
    updateStatus(STATUS.NEEDS_CORRECTION, `Correction requested: ${correctionReason}`, {
      notes: correctionReason,
    });
    toast.info("Correction request sent to club");
    setCorrectionOpen(false);
    setCorrectionReason("");
    setCorrectionFields([]);
  };

  const toggleField = (field) => {
    setCorrectionFields((list) => (list.includes(field) ? list.filter((f) => f !== field) : [...list, field]));
  };

  if (!active) {
    return (
      <div className="p-10">
        <EmptyState icon={Search} title="No applicant selected" description="Pick an applicant from the queue to start reviewing." />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen">
      {/* Left — queue list */}
      <aside className="hidden lg:flex w-[340px] shrink-0 flex-col border-r border-border bg-surface/40">
        <div className="p-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Open queue</div>
          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-tertiary" />
            <Input
              placeholder="Search queue…"
              value={sideSearch}
              onChange={(e) => setSideSearch(e.target.value)}
              data-testid="workbench-search"
              className="pl-8 h-9 bg-surface"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {queueList.length === 0 ? (
            <div className="p-6 text-xs text-tertiary text-center">Queue is clean. 🥋</div>
          ) : (
            queueList.map((f) => {
              const isActive = f.id === activeId;
              return (
                <button
                  key={f.id}
                  onClick={() => pick(f.id)}
                  data-testid={`workbench-row-${f.id}`}
                  className={`group w-full text-left border-b border-border px-4 py-3 flex items-start gap-3 transition-colors ${
                    isActive
                      ? "bg-surface-muted border-l-2 border-l-primary"
                      : "hover:bg-surface-muted/50 border-l-2 border-l-transparent"
                  }`}
                >
                  <Avatar className="size-9 border border-border shrink-0">
                    <AvatarImage src={f.avatar} alt="" />
                    <AvatarFallback className="bg-surface-muted text-[11px] font-semibold">{f.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium truncate">{f.fullName}</div>
                    </div>
                    <div className="text-[11px] text-tertiary truncate mt-0.5">{f.clubName} · {f.weightClass}</div>
                    <div className="mt-1.5">
                      <StatusPill status={f.status} size="xs" />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right — details */}
      <section className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="px-6 py-5 flex items-center gap-4 flex-wrap">
            <Avatar className="size-12 border border-border">
              <AvatarImage src={active.avatar} alt="" />
              <AvatarFallback className="bg-surface-muted text-sm font-semibold">{active.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-tertiary">
                <span className="font-mono">{active.id}</span>
                <ChevronRight className="size-3" />
                <span>{active.clubName}</span>
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">{active.fullName}</h2>
              <div className="mt-1 flex items-center gap-3 flex-wrap">
                <StatusPill status={active.status} />
                <span className="text-xs text-tertiary">Age {active.age} · {active.discipline}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" className="h-9" onClick={() => setCorrectionOpen(true)} data-testid="action-correction">
                <AlertTriangle className="size-4 mr-1.5 text-orange-500" /> Request correction
              </Button>
              <Button variant="outline" className="h-9 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/50" onClick={reject} data-testid="action-reject">
                <XCircle className="size-4 mr-1.5" /> Reject
              </Button>
              <Button className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={approve} data-testid="action-approve">
                <CheckCircle2 className="size-4 mr-1.5" /> Approve
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6 grid gap-5 lg:grid-cols-3">
          {/* Bento: Vitals */}
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric icon={Weight} label="Weight" value={`${active.weight} kg`} sub={active.weightClass} />
            <Metric icon={Trophy} label="Record" value={active.record} sub={`${active.wins} wins`} />
            <Metric icon={Stethoscope} label="Medical" value={active.medicalValid ? "Valid" : "Expired"} tone={active.medicalValid ? "ok" : "warn"} />
            <Metric icon={Calendar} label="Submitted" value={new Date(active.submittedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
          </div>

          {/* Contact */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold mb-3">Contact</div>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2.5"><Mail className="size-4 text-tertiary" /> {active.firstName.toLowerCase()}@mail.com</div>
              <div className="flex items-center gap-2.5"><Phone className="size-4 text-tertiary" /> +81 90 xxxx 1234</div>
              <div className="flex items-center gap-2.5"><MapPin className="size-4 text-tertiary" /> {active.city}</div>
            </div>
          </div>

          {/* Notes */}
          {active.notes && (
            <div className="lg:col-span-3 rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-950/30 p-5">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-orange-700 dark:text-orange-300 font-semibold">
                <AlertTriangle className="size-3.5" /> Outstanding note
              </div>
              <p className="mt-2 text-sm text-orange-900 dark:text-orange-100">{active.notes}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold tracking-tight">Timeline</h3>
              <span className="text-[10px] uppercase tracking-wider text-tertiary font-mono">{active.timeline.length} events</span>
            </div>
            <Separator className="my-4" />
            <Timeline events={active.timeline} />
          </div>

          {/* Checks */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="font-display text-lg font-semibold tracking-tight">Auto checks</h3>
            <Separator className="my-4" />
            <ul className="space-y-3 text-sm">
              <CheckRow ok label="Age within 18–40 bracket" />
              <CheckRow ok={active.medicalValid} label="Medical within 180 days" />
              <CheckRow ok label="Weight within class cap" />
              <CheckRow ok={!active.flags.includes("weight-cut")} label="No weight-cut flag" />
              <CheckRow ok label="Consent signed" />
            </ul>
          </div>
        </div>
      </section>

      {/* Correction drawer */}
      <Sheet open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col" data-testid="correction-drawer">
          <SheetHeader>
            <SheetTitle className="font-display">Request correction</SheetTitle>
            <SheetDescription>
              Mark fields the club needs to fix and explain what's wrong. The applicant will receive a highlighted view of just those fields.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Fields needing correction</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {["Medical cert", "Weight", "Record", "ID scan", "Club letter", "Age proof"].map((f) => {
                  const checked = correctionFields.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleField(f)}
                      data-testid={`correction-field-${f.replace(" ", "-")}`}
                      className={`px-3 py-2 rounded-lg text-left text-sm border transition-all duration-200 ease-ios ${
                        checked
                          ? "border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60"
                          : "border-border bg-surface hover:bg-surface-muted"
                      }`}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Reason</Label>
              <Textarea
                rows={5}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Medical certificate expired 2026-01-12. Please upload renewal."
                className="mt-1.5 bg-surface"
                data-testid="correction-reason"
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCorrectionOpen(false)}>Cancel</Button>
            <Button onClick={submitCorrection} className="bg-orange-600 hover:bg-orange-700 text-white" data-testid="correction-submit">
              Send correction request
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub, tone = "default" }) {
  const tones = {
    ok: "text-emerald-600 dark:text-emerald-400",
    warn: "text-orange-600 dark:text-orange-400",
    default: "text-foreground",
  };
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-tertiary font-semibold">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className={`mt-2 font-display text-xl font-semibold tracking-tight ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-[11px] text-tertiary mt-0.5">{sub}</div>}
    </div>
  );
}

function CheckRow({ ok, label }) {
  return (
    <li className="flex items-center gap-2.5">
      {ok ? (
        <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="size-4 text-red-500 shrink-0" />
      )}
      <span className={ok ? "" : "text-red-600 dark:text-red-400 font-medium"}>{label}</span>
    </li>
  );
}
