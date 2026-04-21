import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { CheckCheck, Download, Filter, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/shared/EmptyState";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { PageSectionHeader, ResponsivePageShell, StickyActionBar } from "@/components/shared/ResponsivePrimitives";
import StatusPill from "@/components/shared/StatusPill";
import api from "@/lib/api";
import { toast } from "sonner";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "under_review", label: "Under review" },
  { id: "needs_correction", label: "Needs correction" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

export default function AdminQueue() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [runningBulkAction, setRunningBulkAction] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    const timer = setTimeout(() => {
      loadQueue();
    }, 250);
    return () => clearTimeout(timer);
  }, [statusFilter, query]);

  async function loadQueue() {
    setLoading(true);
    const { data, error } = await api.queueBoard({
      status: statusFilter,
      q: query || undefined,
      limit: 200,
      offset: 0,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Failed to load review queue");
      return;
    }
    setItems(data.items || []);
    setCounts(data.counts || {});
    setSelected(new Set());
  }

  const countByStatus = useMemo(() => {
    const total = Object.values(counts || {}).reduce((sum, n) => sum + Number(n || 0), 0);
    return {
      ...counts,
      all: total,
    };
  }, [counts]);

  const toggleSelect = (entryId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((entry) => entry.id)));
  };

  const bulkSetStatus = async (action) => {
    if (!selected.size) return;
    const ids = Array.from(selected);
    let reason;
    let fields;

    if (action === "reject") {
      reason = window.prompt("Rejection reason", "Eligibility criteria not met");
      if (!reason) return;
    }
    if (action === "request_correction") {
      reason = window.prompt("Correction reason", "Please update the flagged fields");
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

    setRunningBulkAction(true);
    const { data, error } = await api.bulkDecide({ ids, action, reason, fields });
    setRunningBulkAction(false);
    if (error) {
      toast.error(error.message || "Bulk action failed");
      return;
    }

    const ok = (data.results || []).filter((result) => result.ok).length;
    const failed = (data.results || []).length - ok;
    if (failed > 0) {
      toast.warning(`Bulk action finished: ${ok} succeeded, ${failed} failed`);
    } else {
      toast.success(`Bulk action applied to ${ok} application${ok === 1 ? "" : "s"}`);
    }
    loadQueue();
  };

  const handleExportApproved = async () => {
    const { error } = await api.downloadApprovedXlsx();
    if (error) {
      toast.error(error.message || "Failed to export approved applications");
      return;
    }
    toast.success("Approved applications export started");
  };

  return (
    <ResponsivePageShell className="flex flex-col h-full">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="py-5">
          <PageSectionHeader
            eyebrow="Admin queue"
            title="Discipline-by-discipline review"
            description={`${items.length} queued application${items.length === 1 ? "" : "s"} - live from review API`}
            actions={(
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full sm:w-auto"
                onClick={handleExportApproved}
              >
                <Download className="size-4" /> Export approved
              </Button>
            )}
            compact
          />
        </div>

        <div className="pb-4 flex gap-3">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tertiary" />
            <Input
              placeholder="Search applicant, club, or application ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9 h-10 bg-surface"
            />
          </div>
        </div>

        <div className="pb-4 flex items-center gap-2 overflow-x-auto mobile-scroll-snap">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setStatusFilter(filter.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${statusFilter === filter.id ? "bg-surface-muted text-foreground shadow-inner-top" : "text-secondary-muted hover:text-foreground hover:bg-surface-muted/60"}`}
            >
              {filter.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${statusFilter === filter.id ? "bg-foreground text-background" : "bg-surface text-tertiary"}`}>
                {countByStatus[filter.id] || 0}
              </span>
            </button>
          ))}
          <span className="inline-flex items-center gap-1 text-xs text-tertiary ml-auto">
            <Filter className="size-3.5" /> Status filter {statusFilter === "all" ? "off" : "on"}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="py-2">
            <SectionLoader
              title="Loading review queue"
              description="Pulling the latest fighters, filters, and queue counts from the live review API."
              cards={3}
              rows={6}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10">
            <EmptyState icon={Search} title="No entries match these filters" description="Clear the search or switch the discipline and status filters." />
          </div>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {items.map((entry) => (
              <article
                key={entry.id}
                className={`rounded-2xl border p-4 ${selected.has(entry.id) ? "border-primary/50 bg-primary/5" : "border-border bg-surface/70"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{entry.first_name} {entry.last_name}</div>
                    <div className="mt-1 text-[11px] text-tertiary break-all">{entry.id}</div>
                    <div className="mt-2 text-sm text-secondary-muted">{entry.tournament_name}</div>
                    <div className="text-sm text-secondary-muted">{entry.club_name || "Individual"}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Checkbox checked={selected.has(entry.id)} onCheckedChange={() => toggleSelect(entry.id)} />
                    <StatusPill status={entry.status} size="xs" />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => router.push(`/admin/review/${entry.id}`)}>
                    Open
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <table className="hidden md:table w-full text-left border-collapse">
            <thead className="sticky top-0 bg-background/95 backdrop-blur-xl">
              <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                <th className="pl-6 py-3 w-10">
                  <Checkbox checked={selected.size > 0 && selected.size === items.length} onCheckedChange={selectAll} />
                </th>
                <th className="py-3">Applicant</th>
                <th className="py-3 hidden lg:table-cell">Tournament</th>
                <th className="py-3 hidden md:table-cell">Club</th>
                <th className="py-3">Status</th>
                <th className="py-3 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr
                  key={entry.id}
                  className={`border-b border-border ${selected.has(entry.id) ? "bg-primary/5" : "hover:bg-surface-muted/50"}`}
                >
                  <td className="pl-6 py-3" onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={selected.has(entry.id)} onCheckedChange={() => toggleSelect(entry.id)} />
                  </td>
                  <td className="py-3 cursor-pointer" onClick={() => router.push(`/admin/review/${entry.id}`)}>
                    <div className="text-sm font-medium">{entry.first_name} {entry.last_name}</div>
                    <div className="text-[11px] text-tertiary font-mono mt-1">{entry.id}</div>
                  </td>
                  <td className="py-3 hidden lg:table-cell text-sm">{entry.tournament_name}</td>
                  <td className="py-3 hidden md:table-cell text-sm">{entry.club_name || "Individual"}</td>
                  <td className="py-3"><StatusPill status={entry.status} size="xs" /></td>
                  <td className="py-3 pr-6 text-right">
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/review/${entry.id}`)}>Open</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>

      {selected.size > 0 && (
        <StickyActionBar className="animate-slide-up">
          <div className="w-full text-sm font-medium sm:w-auto sm:pr-2">
            <span className="font-mono tabular-nums">{selected.size}</span> selected
          </div>
          <Button size="sm" variant="ghost" className="flex-1 sm:flex-none" disabled={runningBulkAction} onClick={() => bulkSetStatus("approve")}>
            <CheckCheck className="size-3.5" /> Approve
          </Button>
          <Button size="sm" variant="ghost" className="flex-1 sm:flex-none" disabled={runningBulkAction} onClick={() => bulkSetStatus("request_correction")}>
            <Filter className="size-3.5" /> Correction
          </Button>
          <Button size="sm" variant="ghost" className="flex-1 sm:flex-none" disabled={runningBulkAction} onClick={() => bulkSetStatus("reject")}>
            <XCircle className="size-3.5" /> Reject
          </Button>
        </StickyActionBar>
      )}
    </ResponsivePageShell>
  );
}
