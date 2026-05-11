import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCcw, Search, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { useLocale } from "@/context/LocaleContext";
import api from "@/lib/api";
import { toast } from "sonner";

const ENTITY_OPTIONS = [
  { value: "all", label: "All entities" },
  { value: "application", label: "Application" },
  { value: "club", label: "Club" },
  { value: "tournament", label: "Tournament" },
  { value: "division", label: "Division" },
  { value: "match", label: "Match" },
  { value: "weighin", label: "Weigh-in" },
  { value: "user", label: "User" },
  { value: "appeal", label: "Appeal" },
  { value: "circular", label: "Circular" },
  { value: "album", label: "Album" },
];

function actorLabel(row) {
  if (row.actor_name) return row.actor_name;
  if (row.actor_email) return row.actor_email;
  if (row.actor_user_id) return row.actor_user_id.slice(0, 8);
  return "system";
}

function payloadPreview(payload) {
  if (!payload || typeof payload !== "object") return "";
  const keys = Object.keys(payload);
  if (!keys.length) return "";
  return keys
    .slice(0, 4)
    .map((k) => {
      const v = payload[k];
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k}: ${s.length > 40 ? `${s.slice(0, 40)}…` : s}`;
    })
    .join(" • ");
}

export default function AdminAuditLog() {
  const locale = useLocale();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [chain, setChain] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [searchAction, setSearchAction] = useState("");
  const [expanded, setExpanded] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const q = { limit: 200 };
      if (actionFilter) q.action = actionFilter;
      if (entityFilter !== "all") q.entityType = entityFilter;
      const [list, sum] = await Promise.all([
        api.auditList(q),
        api.auditSummary().catch(() => null),
      ]);
      setEntries(list?.entries || []);
      if (sum) setSummary(sum);
    } catch (err) {
      toast.error(err?.message || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setVerifying(true);
    try {
      const result = await api.auditVerify();
      setChain(result);
      if (result?.ok) toast.success(`Audit chain verified across ${result.count} entries`);
      else toast.error(`Audit chain broken at id ${result?.brokenAt}`);
    } catch (err) {
      toast.error(err?.message || "Failed to verify audit chain");
    } finally {
      setVerifying(false);
    }
  }

  useEffect(() => { refresh(); }, [actionFilter, entityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function applySearch(e) {
    e.preventDefault();
    setActionFilter(searchAction.trim());
  }

  return (
    <ResponsivePageShell className="space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">
          {locale?.t("roles.admin", "Admin") ?? "Admin"}
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mt-1">
          Audit log
        </h1>
        <p className="text-sm text-secondary-muted mt-2 max-w-2xl">
          Tamper-evident, append-only record of every administrative action. Each row's hash
          chains to the previous; "Verify chain" recomputes the chain end-to-end.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface elev-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-tertiary font-semibold">Total entries</div>
          <div className="font-display text-3xl font-semibold mt-1">{summary?.total?.toLocaleString() ?? "—"}</div>
          {summary?.latestAt ? (
            <div className="text-xs text-secondary-muted mt-1">Latest: {new Date(summary.latestAt).toLocaleString()}</div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface elev-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-tertiary font-semibold">Top actions (7 d)</div>
          <div className="mt-2 space-y-1 max-h-[140px] overflow-auto">
            {summary?.last7Days?.length ? summary.last7Days.slice(0, 8).map((row) => (
              <div key={row.action} className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => { setActionFilter(row.action); setSearchAction(row.action); }}
                  className="font-mono text-foreground hover:underline truncate text-left"
                  title={row.action}
                >
                  {row.action}
                </button>
                <span className="font-mono text-secondary tabular-nums">{row.count}</span>
              </div>
            )) : <div className="text-xs text-secondary-muted">No activity yet.</div>}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface elev-card p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-tertiary font-semibold">Hash chain</div>
            <Button size="sm" variant="outline" onClick={verify} disabled={verifying}>
              {verifying ? "Verifying…" : "Verify chain"}
            </Button>
          </div>
          {chain?.ok ? (
            <div className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="size-3.5" /> verified ({chain.count} entries)
            </div>
          ) : chain && !chain.ok ? (
            <div className="mt-2 inline-flex items-center gap-1 text-xs text-red-700">
              <AlertTriangle className="size-3.5" /> broken at id {chain.brokenAt}
            </div>
          ) : (
            <div className="mt-2 text-xs text-secondary-muted">Not verified this session.</div>
          )}
          <a
            href="/api/audit/export.xlsx"
            className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Download className="size-3.5" /> Export full log (.xlsx)
          </a>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface elev-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">Recent entries</h2>
              <p className="text-xs text-secondary-muted mt-1">Showing up to 200 most recent rows. Click a row to view its full payload.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <form onSubmit={applySearch} className="relative">
              <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-secondary-muted" />
              <Input
                value={searchAction}
                onChange={(e) => setSearchAction(e.target.value)}
                placeholder="action e.g. application.approve"
                className="pl-8 w-[260px]"
              />
            </form>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Entity" /></SelectTrigger>
              <SelectContent>
                {ENTITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {actionFilter ? (
              <Button size="sm" variant="ghost" onClick={() => { setActionFilter(""); setSearchAction(""); }}>Clear</Button>
            ) : null}
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCcw className="size-4" /> Refresh
            </Button>
          </div>
        </div>

        {loading && !entries.length ? <SectionLoader /> : null}

        {!loading && !entries.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/50 p-6 text-center text-sm text-secondary-muted">
            No audit entries yet matching these filters.
          </div>
        ) : null}

        {entries.length ? (
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-[11px] uppercase tracking-wider text-secondary-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">When</th>
                    <th className="text-left px-3 py-2 font-semibold">Actor</th>
                    <th className="text-left px-3 py-2 font-semibold">Action</th>
                    <th className="text-left px-3 py-2 font-semibold">Entity</th>
                    <th className="text-left px-3 py-2 font-semibold">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((row) => (
                    <Row key={row.id} row={row} expanded={expanded === row.id} onToggle={() => setExpanded((cur) => cur === row.id ? null : row.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </ResponsivePageShell>
  );
}

function Row({ row, expanded, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-surface-muted/40">
        <td className="px-3 py-2 align-top whitespace-nowrap text-xs text-secondary">
          {new Date(row.occurred_at).toLocaleString()}
        </td>
        <td className="px-3 py-2 align-top">
          <div className="text-xs text-foreground truncate max-w-[180px]">{actorLabel(row)}</div>
          <div className="text-[10px] uppercase tracking-wider text-tertiary mt-0.5">{row.actor_role || "—"}</div>
        </td>
        <td className="px-3 py-2 align-top font-mono text-xs">{row.action}</td>
        <td className="px-3 py-2 align-top">
          <div className="font-mono text-[11px] text-secondary">{row.entity_type}</div>
          <div className="font-mono text-[10px] text-tertiary truncate max-w-[160px]" title={row.entity_id}>{row.entity_id}</div>
        </td>
        <td className="px-3 py-2 align-top text-xs text-secondary-muted truncate max-w-[400px]">
          {payloadPreview(row.payload)}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={5} className="px-3 py-3 bg-background/40">
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-[320px] overflow-auto rounded-lg border border-border bg-surface p-3">
{JSON.stringify(row.payload || {}, null, 2)}
            </pre>
            {row.request_ip ? (
              <div className="mt-2 text-[11px] text-tertiary">From IP: <span className="font-mono">{row.request_ip}</span></div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
