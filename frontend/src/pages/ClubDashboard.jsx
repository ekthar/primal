import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, AlertTriangle, FileEdit, Plus, Search, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import api from "@/lib/api";
import { toast } from "sonner";

export default function ClubDashboard() {
  const [clubs, setClubs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([api.listClubs(), api.listApplications()]).then(([clubsRes, appRes]) => {
      if (!clubsRes.error) setClubs(clubsRes.data.clubs || []);
      if (!appRes.error) setApplications(appRes.data.items || []);
    });
  }, []);

  const correctionItems = useMemo(() => applications.filter((application) => application.status === "needs_correction"), [applications]);
  const filtered = useMemo(() => {
    if (!query) return applications;
    const needle = query.toLowerCase();
    return applications.filter((application) => `${application.first_name} ${application.last_name}`.toLowerCase().includes(needle));
  }, [applications, query]);
  const counts = useMemo(() => ({
    draft: applications.filter((item) => item.status === "draft").length,
    submitted: applications.filter((item) => item.status === "submitted").length,
    needs_correction: correctionItems.length,
    approved: applications.filter((item) => item.status === "approved").length,
  }), [applications, correctionItems.length]);

  const resubmit = async (id) => {
    const { error } = await api.resubmitApplication(id);
    if (error) {
      toast.error(error.message || "Resubmit failed");
      return;
    }
    const refreshed = await api.listApplications();
    if (!refreshed.error) setApplications(refreshed.data.items || []);
  };

  return (
    <div className="px-6 py-6 md:py-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Club dashboard</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">{clubs[0]?.name || "Club workspace"}</h1>
          <p className="text-sm text-secondary-muted mt-1">{clubs[0]?.city || "-"} · {applications.length} club-scoped applications</p>
        </div>
        <Link href="/register?track=club">
          <Button className="bg-foreground text-background hover:bg-foreground/90">
            <Plus className="size-4 mr-1" /> Update club setup
          </Button>
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Drafts" value={counts.draft} icon={FileEdit} />
        <StatCard label="Submitted" value={counts.submitted} icon={Send} />
        <StatCard label="Needs correction" value={counts.needs_correction} icon={AlertTriangle} highlight />
        <StatCard label="Approved" value={counts.approved} icon={Inbox} />
      </div>

      <Tabs defaultValue="inbox" className="mt-8">
        <TabsList className="bg-surface-muted p-1 rounded-xl h-auto">
          <TabsTrigger value="inbox" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2">
            Correction inbox
          </TabsTrigger>
          <TabsTrigger value="roster" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2">
            Applications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-5">
          {correctionItems.length === 0 ? (
            <EmptyState icon={Inbox} title="Inbox zero." description="No correction requests are open for this club." />
          ) : (
            <div className="space-y-3">
              {correctionItems.map((application) => (
                <article key={application.id} className="rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-surface p-5 elev-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-display text-lg font-semibold tracking-tight">{application.first_name} {application.last_name}</h3>
                        <StatusPill status={application.status} />
                      </div>
                      <div className="text-xs text-tertiary mt-1 font-mono">{application.id} · {application.tournament_name}</div>
                      <div className="mt-3 text-sm text-orange-900 dark:text-orange-100">
                        Correction due {application.correction_due_at ? new Date(application.correction_due_at).toLocaleString() : "soon"}.
                      </div>
                    </div>
                    <Button onClick={() => resubmit(application.id)} className="bg-foreground text-background hover:bg-foreground/90">
                      Resubmit
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roster" className="mt-5">
          <div className="relative max-w-sm mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tertiary" />
            <Input placeholder="Search applications..." value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9 h-9 bg-surface" />
          </div>
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                  <th className="px-5 py-3">Applicant</th>
                  <th className="px-5 py-3 hidden md:table-cell">Tournament</th>
                  <th className="px-5 py-3 hidden sm:table-cell">Discipline</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((application) => (
                  <tr key={application.id} className="border-b border-border hover:bg-surface-muted/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium">{application.first_name} {application.last_name}</div>
                      <div className="text-[11px] text-tertiary font-mono">{application.id}</div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-sm">{application.tournament_name}</td>
                    <td className="px-5 py-3 hidden sm:table-cell text-sm">{application.discipline || "-"}</td>
                    <td className="px-5 py-3"><StatusPill status={application.status} /></td>
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

function StatCard({ label, value, icon: Icon, highlight }) {
  return (
    <div className={`rounded-2xl border p-5 bg-surface ${highlight ? "border-orange-200 dark:border-orange-900/50" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-tertiary font-semibold">{label}</span>
        <Icon className="size-4 text-tertiary" strokeWidth={1.75} />
      </div>
      <div className="mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}
