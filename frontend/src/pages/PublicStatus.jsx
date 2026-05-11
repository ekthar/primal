import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Database,
  Activity,
  Mail,
  Scale,
  Trophy,
  Users,
  RefreshCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";

const REFRESH_INTERVAL_MS = 30 * 1000;

function relativeFromNow(iso) {
  if (!iso) return "—";
  try {
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return "—";
    const diffMs = Date.now() - ts;
    const min = Math.round(diffMs / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} h ago`;
    const days = Math.round(hr / 24);
    return `${days} d ago`;
  } catch {
    return "—";
  }
}

function formatStamp(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return null;
  }
}

function StatusPill({ ok, label }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border " +
        (ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-red-300 bg-red-50 text-red-800")
      }
    >
      {ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
      {label}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-border bg-surface elev-card p-5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-tertiary font-semibold">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="font-display text-3xl font-semibold mt-2 tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-secondary-muted mt-1">{sub}</div> : null}
    </div>
  );
}

function ActivityRow({ icon: Icon, label, lastAt, recent, recentLabel }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-start gap-3">
        <Icon className="size-4 text-secondary mt-0.5" />
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-secondary-muted mt-0.5">
            Last: {relativeFromNow(lastAt)} {formatStamp(lastAt) ? `(${formatStamp(lastAt)})` : ""}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm tabular-nums">{recent.toLocaleString()}</div>
        <div className="text-[10px] uppercase tracking-wider text-tertiary">{recentLabel}</div>
      </div>
    </div>
  );
}

export default function PublicStatus() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);

  async function load() {
    try {
      const res = await api.publicStatus();
      setData(res);
      setError(null);
      setLoadedAt(new Date());
    } catch (err) {
      setError(err?.message || "API unreachable");
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const apiOk = !error && Boolean(data?.ok);
  const dbOk = Boolean(data?.db?.ok);

  return (
    <ResponsivePageShell className="space-y-8 py-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> Home
        </Link>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs hover:bg-surface-muted transition-colors"
        >
          <RefreshCcw className="size-3.5" /> Refresh
        </button>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">System</div>
        <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight mt-1">Primal status</h1>
        <p className="text-sm text-secondary-muted mt-2 max-w-xl">
          Live health of the Primal API and a snapshot of activity across tournaments. Auto-refreshes every 30 seconds.
        </p>
        {loadedAt ? (
          <div className="text-[11px] text-tertiary mt-2">Updated {relativeFromNow(loadedAt.toISOString())}</div>
        ) : null}
      </div>

      <section className="rounded-3xl border border-border bg-surface elev-card p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="font-display text-xl font-semibold tracking-tight">Service health</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill ok={apiOk} label={apiOk ? "API operational" : "API unreachable"} />
            <StatusPill ok={dbOk} label={dbOk ? `Database ${data?.db?.latencyMs ?? "—"} ms` : "Database degraded"} />
          </div>
        </div>
        {error ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {data?.api?.startedAt ? (
          <div className="text-xs text-secondary-muted mt-3">
            API process started {relativeFromNow(data.api.startedAt)} · environment <span className="font-mono text-foreground">{data.api.env}</span>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={Trophy} label="Tournaments" value={data?.counts?.tournaments?.toLocaleString() ?? "—"} sub="published" />
        <MetricCard icon={Users} label="Approved athletes" value={data?.counts?.approvedApplications?.toLocaleString() ?? "—"} sub="across all seasons" />
        <MetricCard icon={Trophy} label="Clubs registered" value={data?.counts?.clubs?.toLocaleString() ?? "—"} sub="active organisations" />
      </section>

      <section className="rounded-3xl border border-border bg-surface elev-card p-6">
        <h2 className="font-display text-xl font-semibold tracking-tight">Live activity</h2>
        <p className="text-xs text-secondary-muted mt-1">Most recent operational events captured by the system.</p>
        <div className="mt-4">
          <ActivityRow
            icon={Activity}
            label="Match results recorded"
            lastAt={data?.activity?.lastMatchCompletedAt}
            recent={data?.activity?.matchesCompleted30d ?? 0}
            recentLabel="last 30 days"
          />
          <ActivityRow
            icon={Scale}
            label="Weigh-ins captured"
            lastAt={data?.activity?.lastWeighInAt}
            recent={data?.activity?.weighInsRecorded30d ?? 0}
            recentLabel="last 30 days"
          />
          <ActivityRow
            icon={Mail}
            label="Notification emails delivered"
            lastAt={data?.activity?.lastEmailSentAt}
            recent={data?.activity?.emailsSent7d ?? 0}
            recentLabel="last 7 days"
          />
          <ActivityRow
            icon={Database}
            label="Database round-trip"
            lastAt={data?.asOf}
            recent={data?.db?.latencyMs ?? 0}
            recentLabel="ms"
          />
        </div>
      </section>

      <p className="text-xs text-tertiary text-center">
        This page is anonymous and contains no personally identifiable information. Numbers shown are aggregates only.
      </p>
    </ResponsivePageShell>
  );
}
