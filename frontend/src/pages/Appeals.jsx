import { useEffect, useMemo, useState } from "react";
import { Gavel, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Appeals() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [appeals, setAppeals] = useState([]);
  const [applicationById, setApplicationById] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [verdict, setVerdict] = useState("");

  useEffect(() => {
    loadAppeals();
  }, []);

  async function loadAppeals() {
    setLoading(true);
    const { data, error } = await api.openAppeals();
    if (error) {
      setLoading(false);
      toast.error(error.message || "Failed to load appeals");
      return;
    }

    const items = data.appeals || [];
    setAppeals(items);
    setSelectedId((current) => {
      if (!items.length) return null;
      if (current && items.some((item) => item.id === current)) return current;
      return items[0].id;
    });

    const ids = Array.from(new Set(items.map((item) => item.application_id).filter(Boolean)));
    const responses = await Promise.all(ids.map((id) => api.getApplication(id)));
    const nextMap = {};
    ids.forEach((id, index) => {
      const response = responses[index];
      if (!response.error && response.data?.application) {
        nextMap[id] = response.data.application;
      }
    });
    setApplicationById(nextMap);
    setLoading(false);
  }

  async function decide(action) {
    if (user?.role !== "admin") return;
    if (!selected) return;
    if (!verdict.trim()) {
      toast.error("Panel decision is required");
      return;
    }
    const { error } = await api.decideAppeal(selected.id, { action, panelDecision: verdict.trim() });
    if (error) {
      toast.error(error.message || "Appeal decision failed");
      return;
    }
    toast.success(action === "grant" ? "Appeal granted" : "Appeal denied");
    setVerdict("");
    loadAppeals();
  }

  const selected = useMemo(() => appeals.find((item) => item.id === selectedId) || null, [appeals, selectedId]);
  const application = selected ? applicationById[selected.application_id] : null;

  if (loading) {
    return <div className="p-10 text-sm text-secondary-muted">Loading appeals...</div>;
  }

  if (!appeals.length) {
    return <div className="p-10 text-sm text-secondary-muted">No open appeals at the moment.</div>;
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-56px)] md:min-h-screen">
      {/* List */}
      <aside className="w-[360px] shrink-0 border-r border-border bg-surface/40 hidden md:flex flex-col">
        <div className="p-5 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Appeals</div>
          <h2 className="font-display text-xl font-semibold tracking-tight mt-1">Contested decisions</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {appeals.map((a) => {
            const app = applicationById[a.application_id];
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
                  <AvatarImage src={app?.avatar_url || ""} alt="" />
                  <AvatarFallback className="bg-surface-muted text-[11px] font-semibold">
                    {(app?.first_name?.[0] || "?") + (app?.last_name?.[0] || "")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{app ? `${app.first_name} ${app.last_name}` : "—"}</div>
                  </div>
                  <div className="text-[11px] text-tertiary font-mono">{a.id} · {a.application_id}</div>
                  <p className="mt-1 text-xs text-secondary-muted line-clamp-2">{a.reason}</p>
                  <div className="mt-2"><AppealStatusBadge status={a.status} /></div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Detail */}
      <section className="flex-1 overflow-y-auto">
        {selected ? (
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
                  <AvatarImage src={application?.avatar_url || ""} alt="" />
                  <AvatarFallback className="bg-surface-muted font-semibold">
                    {(application?.first_name?.[0] || "?") + (application?.last_name?.[0] || "")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-display text-xl font-semibold tracking-tight">
                    {application ? `${application.first_name} ${application.last_name}` : "Application details loading..."}
                  </div>
                  <div className="text-xs text-tertiary font-mono">{selected.application_id} · {application?.club_name || "Individual"}</div>
                </div>
                <div className="ml-auto"><AppealStatusBadge status={selected.status} /></div>
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
              {user?.role === "admin" ? (
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/50"
                    data-testid="appeal-deny"
                    onClick={() => decide("deny")}
                  >
                    Deny appeal
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid="appeal-grant"
                    onClick={() => decide("grant")}
                  >
                    Grant appeal
                  </Button>
                </div>
              ) : (
                <div className="mt-4 text-sm text-secondary-muted">Reviewer access is read-only for appeal decisions.</div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AppealStatusBadge({ status }) {
  const styleByStatus = {
    submitted: "bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50",
    under_review: "bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/50",
    granted: "bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/50",
    denied: "bg-red-50 text-red-700 border border-red-100 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900/50",
    withdrawn: "bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-300 dark:border-zinc-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${styleByStatus[status] || styleByStatus.submitted}`}>
      {status.replace("_", " ")}
    </span>
  );
}
