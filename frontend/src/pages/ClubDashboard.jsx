import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Inbox, AlertTriangle, FileEdit, Send, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import { FIGHTERS, STATUS, statusCounts } from "@/lib/mockData";
import { toast } from "sonner";

export default function ClubDashboard() {
  const clubId = "c1"; // mocked: user's club
  const [roster, setRoster] = useState(() => FIGHTERS.filter((f) => f.clubId === clubId));
  const [query, setQuery] = useState("");
  const counts = useMemo(() => statusCounts(roster), [roster]);

  const correctionItems = useMemo(
    () => roster.filter((f) => f.status === STATUS.NEEDS_CORRECTION),
    [roster]
  );

  const filtered = useMemo(() => {
    if (!query) return roster;
    const q = query.toLowerCase();
    return roster.filter((f) => f.fullName.toLowerCase().includes(q));
  }, [roster, query]);

  const resubmit = (id) => {
    setRoster((list) =>
      list.map((f) =>
        f.id === id
          ? {
              ...f,
              status: STATUS.SUBMITTED,
              timeline: [
                ...f.timeline,
                { at: new Date().toISOString(), kind: "submitted", label: "Correction resubmitted", actor: "Club" },
              ],
              notes: "",
            }
          : f
      )
    );
    toast.success("Corrected submission sent for review");
  };

  return (
    <div className="px-6 py-6 md:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Club dashboard</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">Sakura Gym</h1>
          <p className="text-sm text-secondary-muted mt-1">Tokyo, JP · {roster.length} fighters on roster</p>
        </div>
        <Button className="bg-foreground text-background hover:bg-foreground/90" data-testid="club-add-fighter">
          <Plus className="size-4 mr-1" /> Register fighter
        </Button>
      </div>

      {/* Bento metrics */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Drafts" value={counts.draft || 0} icon={FileEdit} tone="muted" />
        <StatCard label="Submitted" value={counts.submitted || 0} icon={Send} tone="blue" />
        <StatCard label="Needs correction" value={counts.needs_correction || 0} icon={AlertTriangle} tone="orange" highlight />
        <StatCard label="Approved" value={counts.approved || 0} icon={Inbox} tone="emerald" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="inbox" className="mt-8">
        <TabsList className="bg-surface-muted p-1 rounded-xl h-auto">
          <TabsTrigger value="inbox" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2" data-testid="tab-inbox">
            Correction inbox
            {correctionItems.length > 0 && (
              <span className="ml-2 text-[10px] font-mono bg-orange-500 text-white rounded-full px-1.5 py-0.5">{correctionItems.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="roster" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2" data-testid="tab-roster">
            Roster
          </TabsTrigger>
        </TabsList>

        {/* Correction inbox */}
        <TabsContent value="inbox" className="mt-5">
          {correctionItems.length === 0 ? (
            <EmptyState icon={Inbox} title="Inbox zero." description="No pending corrections from the federation. Nice work." />
          ) : (
            <div className="space-y-3">
              {correctionItems.map((f) => (
                <article
                  key={f.id}
                  data-testid={`correction-card-${f.id}`}
                  className="rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-surface p-5 elev-card hover:-translate-y-0.5 transition-all duration-300 ease-ios"
                >
                  <div className="flex items-start gap-4">
                    <Avatar className="size-11 border border-border">
                      <AvatarImage src={f.avatar} alt="" />
                      <AvatarFallback className="bg-surface-muted text-xs font-semibold">{f.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-display text-lg font-semibold tracking-tight">{f.fullName}</h3>
                        <StatusPill status={f.status} />
                      </div>
                      <div className="text-xs text-tertiary mt-0.5 font-mono">
                        {f.id} · {f.weightClass} · Updated {new Date(f.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                      <div className="mt-3 rounded-lg border border-orange-200 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-950/30 px-4 py-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-orange-700 dark:text-orange-300 font-semibold">
                          <AlertTriangle className="size-3.5" /> Reviewer note
                        </div>
                        <p className="mt-1.5 text-sm text-orange-900 dark:text-orange-100">{f.notes || "Please update the flagged fields."}</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => resubmit(f.id)}
                      className="bg-foreground text-background hover:bg-foreground/90 shrink-0"
                      data-testid={`resubmit-${f.id}`}
                    >
                      Resubmit
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Roster */}
        <TabsContent value="roster" className="mt-5">
          <div className="relative max-w-sm mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tertiary" />
            <Input
              placeholder="Search roster…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="roster-search"
              className="pl-9 h-9 bg-surface"
            />
          </div>
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                  <th className="px-5 py-3">Fighter</th>
                  <th className="px-5 py-3 hidden md:table-cell">Class</th>
                  <th className="px-5 py-3 hidden sm:table-cell">Record</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id} className="border-b border-border hover:bg-surface-muted/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8 border border-border">
                          <AvatarImage src={f.avatar} alt="" />
                          <AvatarFallback className="bg-surface-muted text-[11px] font-semibold">{f.initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">{f.fullName}</div>
                          <div className="text-[11px] text-tertiary font-mono">{f.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-sm text-secondary-muted">{f.weightClass}</td>
                    <td className="px-5 py-3 hidden sm:table-cell text-sm font-mono tabular-nums">{f.record}</td>
                    <td className="px-5 py-3"><StatusPill status={f.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "muted", highlight }) {
  const tones = {
    muted: "text-zinc-500",
    blue: "text-blue-600 dark:text-blue-400",
    orange: "text-orange-600 dark:text-orange-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
  };
  return (
    <div className={`rounded-2xl border p-5 bg-surface ${highlight ? "border-orange-200 dark:border-orange-900/50" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-tertiary font-semibold">{label}</span>
        <Icon className={`size-4 ${tones[tone]}`} strokeWidth={1.75} />
      </div>
      <div className="mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}
