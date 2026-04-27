import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw, Send, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { PageSectionHeader, ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";

function emptyDraft() {
  return { name: "", url: "", events: [], isActive: true };
}

function StatusBadge({ status }) {
  const tone = status === "success"
    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : status === "failed"
    ? "bg-rose-100 text-rose-800 border-rose-200"
    : status === "retry"
    ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-surface-muted text-secondary-muted border-border";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold ${tone}`}>
      {status}
    </span>
  );
}

export default function AdminWebhooks() {
  const [subs, setSubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyDraft());
  const [creating, setCreating] = useState(false);
  const [deliveriesById, setDeliveriesById] = useState({});
  const [secretShown, setSecretShown] = useState(null);

  async function refresh() {
    setLoading(true);
    const [subsRes, eventsRes] = await Promise.all([api.listWebhooks(), api.listWebhookEvents()]);
    setSubs(subsRes?.data?.subscriptions || []);
    setEvents(eventsRes?.data?.events || []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function loadDeliveries(id) {
    const { data, error } = await api.listWebhookDeliveries(id);
    if (error) { toast.error("Failed to load deliveries"); return; }
    setDeliveriesById((prev) => ({ ...prev, [id]: data?.deliveries || [] }));
  }

  async function create() {
    if (!draft.name || !draft.url) { toast.error("Name and URL are required"); return; }
    if (!draft.events.length) { toast.error("Select at least one event"); return; }
    setCreating(true);
    try {
      const { data, error } = await api.createWebhook(draft);
      if (error) throw new Error(error.message || "Failed");
      toast.success("Webhook created");
      setSecretShown({ id: data?.subscription?.id, secret: data?.subscription?.secret });
      setDraft(emptyDraft());
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(sub) {
    const { error } = await api.updateWebhook(sub.id, { isActive: !sub.isActive });
    if (error) { toast.error(error.message || "Update failed"); return; }
    await refresh();
  }

  async function remove(sub) {
    if (!window.confirm(`Delete webhook "${sub.name}"?`)) return;
    const { error } = await api.deleteWebhook(sub.id);
    if (error) { toast.error(error.message || "Delete failed"); return; }
    toast.success("Deleted");
    await refresh();
  }

  async function test(sub) {
    const { data, error } = await api.testWebhook(sub.id, { event: sub.events[0] || "application.approved" });
    if (error) { toast.error(error.message || "Test failed"); return; }
    if (data?.ok) toast.success(`Test delivered · ${data.status}`);
    else toast.warning(`Test dispatched · ${data?.status || "unknown"}`);
    loadDeliveries(sub.id);
  }

  const eventGrouped = useMemo(() => {
    const groups = {};
    for (const ev of events) {
      const [key] = ev.split(".");
      groups[key] = groups[key] || [];
      groups[key].push(ev);
    }
    return Object.entries(groups);
  }, [events]);

  if (loading) return <ResponsivePageShell><SectionLoader /></ResponsivePageShell>;

  return (
    <ResponsivePageShell className="space-y-8">
      <PageSectionHeader
        eyebrow="Notifications · Webhooks"
        title="Outbound webhook subscriptions"
        description="Notify external systems (CRM, scoring board, partner CRM) on platform events. Each subscription gets a unique HMAC-SHA256 secret used to sign payloads."
      />

      <section className="rounded-3xl border border-border bg-surface p-6 elev-card">
        <div className="flex items-center gap-2 mb-4">
          <Webhook className="size-5 text-primary" />
          <div className="font-display text-xl font-semibold tracking-tight">Create subscription</div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Scoring board webhook" />
          </div>
          <div>
            <Label>Endpoint URL</Label>
            <Input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://example.com/hooks/primal" />
          </div>
        </div>

        <div className="mt-4">
          <Label className="block mb-2">Events</Label>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {eventGrouped.map(([group, list]) => (
              <div key={group} className="rounded-xl border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold mb-2">{group}</div>
                <div className="space-y-1">
                  {list.map((ev) => (
                    <label key={ev} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.events.includes(ev)}
                        onChange={(e) => {
                          setDraft((d) => ({
                            ...d,
                            events: e.target.checked ? [...d.events, ev] : d.events.filter((x) => x !== ev),
                          }));
                        }}
                      />
                      <code className="font-mono text-[11px]">{ev}</code>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Switch checked={draft.isActive} onCheckedChange={(v) => setDraft({ ...draft, isActive: v })} />
          <span className="text-sm">Active</span>
          <div className="ml-auto">
            <Button onClick={create} disabled={creating}>
              <Plus className="size-4" /> {creating ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>

        {secretShown ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <div className="text-[10px] uppercase tracking-wider font-semibold">Save this secret — shown once</div>
            <code className="mt-1 block break-all font-mono text-xs">{secretShown.secret}</code>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6 elev-card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="font-display text-xl font-semibold tracking-tight">Subscriptions</div>
          <Button variant="outline" onClick={refresh}>
            <RefreshCcw className="size-4" /> Refresh
          </Button>
        </div>
        {subs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-secondary-muted">
            No webhook subscriptions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {subs.map((sub) => {
              const deliveries = deliveriesById[sub.id] || [];
              return (
                <article key={sub.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-display text-lg font-semibold tracking-tight">{sub.name}</div>
                      <code className="block break-all text-xs text-secondary-muted mt-1">{sub.url}</code>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(sub.events || []).map((ev) => (
                          <span key={ev} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-mono">{ev}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={sub.isActive} onCheckedChange={() => toggleActive(sub)} />
                      <Button variant="outline" size="sm" onClick={() => test(sub)}>
                        <Send className="size-3.5" /> Test
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => loadDeliveries(sub.id)}>
                        Deliveries
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => remove(sub)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {deliveries.length ? (
                    <div className="mt-4 rounded-xl border border-border bg-surface-muted/30 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-surface-muted/60">
                          <tr className="text-left">
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Event</th>
                            <th className="px-3 py-2">Attempt</th>
                            <th className="px-3 py-2">HTTP</th>
                            <th className="px-3 py-2">When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveries.slice(0, 10).map((d) => (
                            <tr key={d.id} className="border-t border-border">
                              <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                              <td className="px-3 py-2 font-mono">{d.event}</td>
                              <td className="px-3 py-2">{d.attemptCount}</td>
                              <td className="px-3 py-2">{d.responseCode ?? "—"}</td>
                              <td className="px-3 py-2">{new Date(d.createdAt).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </ResponsivePageShell>
  );
}
