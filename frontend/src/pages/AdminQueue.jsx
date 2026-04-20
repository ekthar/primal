import { useState, useMemo } from "react";
import { useRouter } from "next/router";
import {
  Search,
  Filter,
  Download,
  CheckCheck,
  AlertTriangle,
  X,
  ChevronDown,
  Keyboard,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import { FIGHTERS, STATUS, STATUS_LABELS, statusCounts, CLUBS } from "@/lib/mockData";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ALL_STATUS = Object.values(STATUS);

export default function AdminQueue() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");
  const [clubFilter, setClubFilter] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [fighters, setFighters] = useState(FIGHTERS);
  const [confirm, setConfirm] = useState(null);

  const counts = useMemo(() => statusCounts(fighters), [fighters]);

  const filtered = useMemo(() => {
    return fighters.filter((f) => {
      if (activeStatus !== "all" && f.status !== activeStatus) return false;
      if (clubFilter.length && !clubFilter.includes(f.clubId)) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!f.fullName.toLowerCase().includes(q) && !f.clubName.toLowerCase().includes(q) && !f.id.includes(q))
          return false;
      }
      return true;
    });
  }, [fighters, activeStatus, clubFilter, query]);

  const toggleSelect = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((f) => f.id)));
  };

  const bulkApprove = () => {
    setFighters((list) =>
      list.map((f) => (selected.has(f.id) ? { ...f, status: STATUS.APPROVED } : f))
    );
    toast.success(`${selected.size} applicant${selected.size > 1 ? "s" : ""} approved`);
    setSelected(new Set());
    setConfirm(null);
  };

  const bulkCorrection = () => {
    setFighters((list) =>
      list.map((f) => (selected.has(f.id) ? { ...f, status: STATUS.NEEDS_CORRECTION } : f))
    );
    toast.info(`Correction requested for ${selected.size} applicant${selected.size > 1 ? "s" : ""}`);
    setSelected(new Set());
    setConfirm(null);
  };

  const tabs = [
    { id: "all", label: "All", count: fighters.length },
    ...ALL_STATUS.map((s) => ({ id: s, label: STATUS_LABELS[s], count: counts[s] || 0 })),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Admin</div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-0.5">Review queue</h1>
            <p className="text-sm text-secondary-muted mt-1">
              {filtered.length} of {fighters.length} applicants · Season 2026
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" data-testid="queue-shortcut-btn">
              <Keyboard className="size-3.5" /> Shortcuts
            </Button>
            <Button size="sm" variant="outline" className="h-9" data-testid="queue-export-btn">
              <Download className="size-3.5" /> Export
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-6 pb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tertiary" />
            <Input
              placeholder="Search name, club, or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="queue-search"
              className="pl-9 h-9 bg-surface"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9" data-testid="filter-club">
                <Filter className="size-3.5" /> Club
                {clubFilter.length > 0 && <span className="ml-1 text-[10px] bg-foreground text-background rounded-full px-1.5">{clubFilter.length}</span>}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tertiary">Filter by club</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {CLUBS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={clubFilter.includes(c.id)}
                  onCheckedChange={(chk) =>
                    setClubFilter((list) => (chk ? [...list, c.id] : list.filter((x) => x !== c.id)))
                  }
                  data-testid={`club-filter-${c.id}`}
                >
                  {c.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status tabs */}
        <div className="px-6 pb-3 overflow-x-auto">
          <div className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveStatus(t.id)}
                data-testid={`tab-${t.id}`}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ease-ios whitespace-nowrap ${
                  activeStatus === t.id
                    ? "bg-surface-muted text-foreground shadow-inner-top"
                    : "text-secondary-muted hover:text-foreground hover:bg-surface-muted/60"
                }`}
              >
                {t.label}
                <span className={`text-[10px] font-mono tabular-nums rounded-full px-1.5 py-0.5 ${activeStatus === t.id ? "bg-foreground text-background" : "bg-surface-muted text-tertiary"}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-10">
            <EmptyState
              icon={Search}
              title="No applicants match your filters"
              description="Try clearing the search, status tab, or club filter to see all applicants."
              action={<Button variant="outline" onClick={() => { setQuery(""); setActiveStatus("all"); setClubFilter([]); }} data-testid="empty-clear">Clear filters</Button>}
            />
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-background/95 backdrop-blur-xl">
              <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                <th className="pl-6 py-3 w-10">
                  <Checkbox
                    checked={selected.size > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleAll}
                    data-testid="select-all"
                    aria-label="Select all"
                  />
                </th>
                <th className="py-3">Applicant</th>
                <th className="py-3 hidden md:table-cell">Club</th>
                <th className="py-3 hidden lg:table-cell">Discipline</th>
                <th className="py-3 hidden md:table-cell">Weight</th>
                <th className="py-3 hidden lg:table-cell">Record</th>
                <th className="py-3">Status</th>
                <th className="py-3 pr-6 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const isSelected = selected.has(f.id);
                return (
                  <tr
                    key={f.id}
                    onClick={() => router.push(`/admin/review/${f.id}`)}
                    data-testid={`queue-row-${f.id}`}
                    className={`group border-b border-border cursor-pointer transition-colors ${
                      isSelected ? "bg-primary/5" : "hover:bg-surface-muted/50"
                    }`}
                  >
                    <td className="pl-6 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(f.id)}
                        aria-label={`Select ${f.fullName}`}
                        data-testid={`select-${f.id}`}
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 border border-border">
                          <AvatarImage src={f.avatar} alt="" />
                          <AvatarFallback className="bg-surface-muted text-[11px] font-semibold">{f.initials}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-2">
                            {f.fullName}
                            {f.flags?.includes("weight-cut") && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="size-3" /> Weight-cut
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-tertiary font-mono">{f.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 hidden md:table-cell text-sm">{f.clubName}</td>
                    <td className="py-3 hidden lg:table-cell text-sm text-secondary-muted">{f.discipline}</td>
                    <td className="py-3 hidden md:table-cell text-sm font-mono tabular-nums">{f.weight} kg</td>
                    <td className="py-3 hidden lg:table-cell text-sm font-mono tabular-nums">{f.record}</td>
                    <td className="py-3"><StatusPill status={f.status} /></td>
                    <td className="py-3 pr-6 text-right text-xs text-tertiary font-mono tabular-nums">
                      {new Date(f.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up" data-testid="bulk-action-bar">
          <div className="glass rounded-full shadow-elev px-2 py-2 flex items-center gap-1.5">
            <div className="pl-3 pr-2 text-sm font-medium">
              <span className="font-mono tabular-nums">{selected.size}</span> selected
            </div>
            <div className="h-5 w-px bg-border" />
            <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setConfirm("approve")} data-testid="bulk-approve-btn">
              <CheckCheck className="size-3.5" /> Approve
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setConfirm("correction")} data-testid="bulk-correction-btn">
              <AlertTriangle className="size-3.5" /> Request correction
            </Button>
            <Button size="sm" variant="ghost" className="h-8 rounded-full text-tertiary" onClick={() => setSelected(new Set())} data-testid="bulk-clear">
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {confirm === "approve" ? `Approve ${selected.size} applicant${selected.size > 1 ? "s" : ""}?` : `Request correction from ${selected.size} applicant${selected.size > 1 ? "s" : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "approve"
                ? "Approved applicants will be notified and cleared for weigh-in. This action is logged in the audit trail."
                : "Applicants will receive a correction email. Their submission moves to 'Needs Correction' and they can resubmit the flagged fields."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="confirm-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-proceed"
              onClick={confirm === "approve" ? bulkApprove : bulkCorrection}
              className={confirm === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
