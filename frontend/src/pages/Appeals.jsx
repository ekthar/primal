import { useState } from "react";
import { Gavel, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import StatusPill from "@/components/shared/StatusPill";
import { APPEALS, FIGHTERS } from "@/lib/mockData";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function Appeals() {
  const [selectedId, setSelectedId] = useState(APPEALS[0]?.id);
  const [verdict, setVerdict] = useState("");
  const selected = APPEALS.find((a) => a.id === selectedId);
  const fighter = selected ? FIGHTERS.find((f) => f.id === selected.fighterId) : null;

  return (
    <div className="flex h-full min-h-[calc(100vh-56px)] md:min-h-screen">
      {/* List */}
      <aside className="w-[360px] shrink-0 border-r border-border bg-surface/40 hidden md:flex flex-col">
        <div className="p-5 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Appeals</div>
          <h2 className="font-display text-xl font-semibold tracking-tight mt-1">Contested decisions</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {APPEALS.map((a) => {
            const f = FIGHTERS.find((x) => x.id === a.fighterId);
            const active = a.id === selectedId;
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                data-testid={`appeal-row-${a.id}`}
                className={`w-full text-left px-5 py-4 border-b border-border transition-colors flex items-start gap-3 ${
                  active ? "bg-surface-muted border-l-2 border-l-primary" : "hover:bg-surface-muted/50 border-l-2 border-l-transparent"
                }`}
              >
                <Avatar className="size-9 border border-border shrink-0">
                  <AvatarImage src={f?.avatar} alt="" />
                  <AvatarFallback className="bg-surface-muted text-[11px] font-semibold">{f?.initials || "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{f?.fullName || "—"}</div>
                  </div>
                  <div className="text-[11px] text-tertiary font-mono">{a.id}</div>
                  <p className="mt-1 text-xs text-secondary-muted line-clamp-2">{a.reason}</p>
                  <div className="mt-2"><StatusPill status={a.status} size="xs" /></div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Detail */}
      <section className="flex-1 overflow-y-auto">
        {selected && fighter ? (
          <div className="max-w-3xl mx-auto p-6 md:p-10">
            <div className="flex items-center gap-2 text-xs text-tertiary">
              <Gavel className="size-4" />
              <span>Appeals</span>
              <ChevronRight className="size-3" />
              <span className="font-mono">{selected.id}</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">Appeal hearing</h1>
            <p className="text-sm text-secondary-muted mt-1">Filed {new Date(selected.filedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>

            <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-center gap-3">
                <Avatar className="size-12 border border-border">
                  <AvatarImage src={fighter.avatar} alt="" />
                  <AvatarFallback className="bg-surface-muted font-semibold">{fighter.initials}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-display text-xl font-semibold tracking-tight">{fighter.fullName}</div>
                  <div className="text-xs text-tertiary font-mono">{fighter.id} · {fighter.clubName}</div>
                </div>
                <div className="ml-auto"><StatusPill status={fighter.status} /></div>
              </div>
              <Separator className="my-6" />
              <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">Applicant's statement</div>
              <p className="mt-2 text-sm leading-relaxed">{selected.reason}</p>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-display text-lg font-semibold tracking-tight">Panel decision</h3>
              <Separator className="my-4" />
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Verdict notes</Label>
              <Textarea
                rows={5}
                placeholder="Panel finds in favor of…"
                value={verdict}
                onChange={(e) => setVerdict(e.target.value)}
                className="mt-1.5 bg-surface"
                data-testid="appeal-verdict"
              />
              <div className="flex items-center justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/50"
                  data-testid="appeal-deny"
                  onClick={() => toast.error("Appeal denied — applicant notified")}
                >
                  Deny appeal
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="appeal-grant"
                  onClick={() => toast.success("Appeal granted — status reset")}
                >
                  Grant appeal
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
