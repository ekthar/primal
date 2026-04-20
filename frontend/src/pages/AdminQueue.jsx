import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { CheckCheck, Download, Filter, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/shared/EmptyState";
import EntryStatusPill from "@/components/tournament/EntryStatusPill";
import {
  DISCIPLINE_DEFINITIONS,
  ENTRY_STATUS,
  TOURNAMENT_ENTRIES,
} from "@/lib/tournamentWorkflow";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: ENTRY_STATUS.PENDING, label: "Pending review" },
  { id: ENTRY_STATUS.APPROVED, label: "Approved" },
  { id: ENTRY_STATUS.REJECTED, label: "Rejected" },
];

export default function AdminQueue() {
  const router = useRouter();
  const [entries, setEntries] = useState(TOURNAMENT_ENTRIES);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (statusFilter !== "all" && entry.reviewStatus !== statusFilter) return false;
      if (disciplineFilter !== "all" && entry.disciplineId !== disciplineFilter) return false;
      if (!query) return true;

      const needle = query.toLowerCase();
      return [
        entry.participantName,
        entry.club,
        entry.disciplineLabel,
        entry.categoryLabel,
        entry.id,
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [disciplineFilter, entries, query, statusFilter]);

  const counts = useMemo(() => {
    return STATUS_FILTERS.reduce((acc, filter) => {
      acc[filter.id] =
        filter.id === "all"
          ? entries.length
          : entries.filter((entry) => entry.reviewStatus === filter.id).length;
      return acc;
    }, {});
  }, [entries]);

  const toggleSelect = (entryId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((entry) => entry.id)));
  };

  const bulkSetStatus = (status) => {
    setEntries((current) => current.map((entry) => (
      selected.has(entry.id) ? { ...entry, reviewStatus: status } : entry
    )));
    setSelected(new Set());
  };

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Admin queue</div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1">Discipline-by-discipline review</h1>
            <p className="text-sm text-secondary-muted mt-1">
              {filtered.length} of {entries.length} competition entries · each row is a single discipline record
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-9">
            <Download className="size-4" /> Export queue
          </Button>
        </div>

        <div className="px-6 pb-4 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tertiary" />
            <Input
              placeholder="Search participant, club, discipline, category, or entry ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9 h-10 bg-surface"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {DISCIPLINE_DEFINITIONS.map((discipline) => (
              <button
                key={discipline.id}
                type="button"
                onClick={() => setDisciplineFilter((current) => current === discipline.id ? "all" : discipline.id)}
                className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-wider ${disciplineFilter === discipline.id ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-secondary-muted"}`}
              >
                {discipline.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-4 flex items-center gap-2 overflow-x-auto">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setStatusFilter(filter.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${statusFilter === filter.id ? "bg-surface-muted text-foreground shadow-inner-top" : "text-secondary-muted hover:text-foreground hover:bg-surface-muted/60"}`}
            >
              {filter.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${statusFilter === filter.id ? "bg-foreground text-background" : "bg-surface text-tertiary"}`}>
                {counts[filter.id]}
              </span>
            </button>
          ))}
          <span className="inline-flex items-center gap-1 text-xs text-tertiary ml-auto">
            <Filter className="size-3.5" /> Discipline filter {disciplineFilter === "all" ? "off" : "on"}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-10">
            <EmptyState icon={Search} title="No entries match these filters" description="Clear the search or switch the discipline and status filters." />
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-background/95 backdrop-blur-xl">
              <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                <th className="pl-6 py-3 w-10">
                  <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={selectAll} />
                </th>
                <th className="py-3">Participant</th>
                <th className="py-3 hidden lg:table-cell">Discipline</th>
                <th className="py-3 hidden xl:table-cell">Auto category assignment</th>
                <th className="py-3 hidden md:table-cell">Club</th>
                <th className="py-3">Status</th>
                <th className="py-3 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr
                  key={entry.id}
                  className={`border-b border-border ${selected.has(entry.id) ? "bg-primary/5" : "hover:bg-surface-muted/50"}`}
                >
                  <td className="pl-6 py-3" onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={selected.has(entry.id)} onCheckedChange={() => toggleSelect(entry.id)} />
                  </td>
                  <td className="py-3 cursor-pointer" onClick={() => router.push(`/admin/review/${entry.id}`)}>
                    <div className="text-sm font-medium">{entry.participantName}</div>
                    <div className="text-[11px] text-tertiary font-mono mt-1">{entry.id}</div>
                  </td>
                  <td className="py-3 hidden lg:table-cell text-sm">{entry.disciplineLabel}</td>
                  <td className="py-3 hidden xl:table-cell text-sm text-secondary-muted">{entry.categoryLabel}</td>
                  <td className="py-3 hidden md:table-cell text-sm">{entry.club}</td>
                  <td className="py-3"><EntryStatusPill status={entry.reviewStatus} size="xs" /></td>
                  <td className="py-3 pr-6 text-right">
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/review/${entry.id}`)}>Open</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
          <div className="glass rounded-full px-2 py-2 flex items-center gap-1.5 shadow-elev">
            <div className="pl-3 pr-2 text-sm font-medium">
              <span className="font-mono tabular-nums">{selected.size}</span> selected
            </div>
            <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => bulkSetStatus(ENTRY_STATUS.APPROVED)}>
              <CheckCheck className="size-3.5" /> Approve
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => bulkSetStatus(ENTRY_STATUS.REJECTED)}>
              <XCircle className="size-3.5" /> Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
