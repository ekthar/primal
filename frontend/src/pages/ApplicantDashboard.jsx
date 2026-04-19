import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { FileEdit, Send, AlertTriangle, ChevronRight, Download } from "lucide-react";
import StatusPill from "@/components/shared/StatusPill";
import Timeline from "@/components/shared/Timeline";
import { FIGHTERS, STATUS } from "@/lib/mockData";

export default function ApplicantDashboard() {
  // Pick a representative applicant (one in "needs_correction" for demo richness)
  const me = useMemo(() => {
    return FIGHTERS.find((f) => f.status === STATUS.NEEDS_CORRECTION) || FIGHTERS[0];
  }, []);

  const statusOrder = [STATUS.DRAFT, STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.APPROVED];
  const currentIdx = statusOrder.indexOf(me.status);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Hero card */}
      <div className="rounded-3xl border border-border bg-surface overflow-hidden elev-card">
        <div className="relative bg-gradient-to-br from-surface-muted to-surface p-6 sm:p-8">
          <div className="flex items-start gap-4 flex-wrap">
            <Avatar className="size-16 border border-border">
              <AvatarImage src={me.avatar} alt="" />
              <AvatarFallback className="bg-surface-muted text-sm font-semibold">{me.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">My application</div>
              <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">{me.fullName}</h1>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <StatusPill status={me.status} />
                <span className="text-sm text-secondary-muted">{me.clubName} · {me.weightClass} · {me.discipline}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-9" data-testid="applicant-download">
                <Download className="size-3.5" /> Download PDF
              </Button>
            </div>
          </div>

          {/* Status tracker */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-x-0 top-4 h-0.5 bg-border" />
              <div
                className="absolute top-4 left-0 h-0.5 bg-foreground transition-all duration-700 ease-ios"
                style={{ width: `${(currentIdx / (statusOrder.length - 1)) * 100}%` }}
              />
              <div className="relative grid grid-cols-4 gap-2">
                {statusOrder.map((s, i) => {
                  const done = i < currentIdx;
                  const current = i === currentIdx;
                  return (
                    <div key={s} className="flex flex-col items-center gap-2">
                      <div
                        className={`size-9 rounded-full border flex items-center justify-center transition-all duration-300 ${
                          done
                            ? "bg-foreground text-background border-foreground"
                            : current
                              ? "bg-background text-foreground border-foreground animate-pulse-ring"
                              : "bg-surface text-tertiary border-border"
                        }`}
                      >
                        <span className="text-xs font-mono">{i + 1}</span>
                      </div>
                      <span className={`text-[11px] font-medium text-center ${done || current ? "text-foreground" : "text-tertiary"}`}>
                        {s === "under_review" ? "Under review" : s === "draft" ? "Draft" : s === "submitted" ? "Submitted" : "Approved"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Notes banner if needs correction */}
        {me.status === STATUS.NEEDS_CORRECTION && me.notes && (
          <div className="px-6 sm:px-8 py-4 border-t border-orange-200 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-950/30 flex items-start gap-3">
            <AlertTriangle className="size-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-orange-700 dark:text-orange-300 font-semibold">Action needed</div>
              <p className="mt-1 text-sm text-orange-900 dark:text-orange-100">{me.notes}</p>
            </div>
            <Link to="/club">
              <Button className="bg-orange-600 hover:bg-orange-700 text-white shrink-0" data-testid="applicant-fix-btn">
                Fix now <ChevronRight className="size-4 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Details grid */}
      <div className="grid lg:grid-cols-3 gap-5 mt-6">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-xl font-semibold tracking-tight">Application timeline</h2>
          <Separator className="my-4" />
          <Timeline events={me.timeline} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 h-max">
          <h2 className="font-display text-xl font-semibold tracking-tight">Summary</h2>
          <Separator className="my-4" />
          <dl className="space-y-3 text-sm">
            <Row label="Fighter ID" value={<span className="font-mono">{me.id}</span>} />
            <Row label="Weight" value={`${me.weight} kg`} />
            <Row label="Record" value={me.record} />
            <Row label="Age" value={me.age} />
            <Row label="Medical" value={me.medicalValid ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Valid</span> : <span className="text-orange-600 dark:text-orange-400 font-medium">Review</span>} />
            <Row label="Discipline" value={me.discipline} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</dt>
      <dd className="text-sm text-right">{value}</dd>
    </div>
  );
}
