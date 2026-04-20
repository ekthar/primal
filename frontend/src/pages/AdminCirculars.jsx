import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

const KINDS = [
  { id: "notice", label: "Circular" },
  { id: "registration", label: "Registration" },
  { id: "window", label: "Editing window" },
  { id: "rules", label: "Rules" },
];

function isoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function AdminCirculars() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const selected = useMemo(() => items.find((x) => x.id === selectedId) || null, [items, selectedId]);
  const isEditing = !!selectedId;

  const [draft, setDraft] = useState({
    title: "",
    subtitle: "",
    kind: "notice",
    body: "",
    coverImageUrl: "",
    ctaLabel: "",
    ctaUrl: "",
    pinned: false,
    isPublished: false,
    showFrom: "",
    showUntil: "",
  });

  async function refresh() {
    setLoading(true);
    const { data, error } = await api.listCirculars({ limit: 100, offset: 0, published: "all" });
    if (error) {
      toast({ title: "Failed to load circulars", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setItems(data?.items || []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDraft({
      title: selected.title || "",
      subtitle: selected.subtitle || "",
      kind: selected.kind || "notice",
      body: selected.body || "",
      coverImageUrl: selected.coverImageUrl || "",
      ctaLabel: selected.ctaLabel || "",
      ctaUrl: selected.ctaUrl || "",
      pinned: !!selected.pinned,
      isPublished: !!selected.isPublished,
      showFrom: selected.showFrom ? new Date(selected.showFrom).toISOString().slice(0, 16) : "",
      showUntil: selected.showUntil ? new Date(selected.showUntil).toISOString().slice(0, 16) : "",
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onCreateNew() {
    setSelectedId(null);
    setDraft({
      title: "",
      subtitle: "",
      kind: "notice",
      body: "",
      coverImageUrl: "",
      ctaLabel: "",
      ctaUrl: "",
      pinned: false,
      isPublished: false,
      showFrom: "",
      showUntil: "",
    });
  }

  async function onSave() {
    setSaving(true);
    const payload = {
      title: draft.title,
      subtitle: draft.subtitle || null,
      kind: draft.kind,
      body: draft.body || "",
      coverImageUrl: draft.coverImageUrl || null,
      ctaLabel: draft.ctaLabel || null,
      ctaUrl: draft.ctaUrl || null,
      pinned: !!draft.pinned,
      isPublished: !!draft.isPublished,
      showFrom: isoOrNull(draft.showFrom),
      showUntil: isoOrNull(draft.showUntil),
    };

    const { data, error } = isEditing
      ? await api.updateCircular(selectedId, payload)
      : await api.createCircular(payload);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    toast({ title: "Saved", description: isEditing ? "Circular updated." : "Circular created." });
    await refresh();
    const id = data?.circular?.id || selectedId;
    if (id) setSelectedId(id);
    setSaving(false);
  }

  async function onDelete() {
    if (!selectedId) return;
    setSaving(true);
    const { error } = await api.deleteCircular(selectedId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    toast({ title: "Deleted", description: "Circular removed." });
    setSelectedId(null);
    await refresh();
    setSaving(false);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-tertiary font-semibold">Admin</div>
          <h1 className="font-display mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">Public circulars</h1>
          <p className="mt-3 text-secondary-muted max-w-2xl">
            Publish announcements that show up on the landing page (registration windows, rule updates, notices).
          </p>
        </div>
        <Button onClick={onCreateNew} className="rounded-full" data-testid="circular-new">
          <Plus className="size-4 mr-2" /> New circular
        </Button>
      </div>

      <div className="mt-8 grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
        <div className="rounded-3xl border border-border bg-surface overflow-hidden elev-card">
          <div className="px-6 py-4 border-b border-border bg-surface-muted/40 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-tertiary">Library</div>
            <div className="text-xs text-tertiary">{loading ? "Loading…" : `${items.length} items`}</div>
          </div>
          <div className="p-3 space-y-2 max-h-[70vh] overflow-auto">
            {items.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left rounded-2xl border px-4 py-3 transition-all ${
                  selectedId === c.id ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-muted/60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.title}</div>
                    <div className="text-[11px] text-tertiary truncate">
                      {c.kind} · {c.isPublished ? "published" : "draft"}{c.pinned ? " · pinned" : ""}
                    </div>
                  </div>
                  {c.ctaUrl ? <ArrowUpRight className="size-4 text-tertiary" /> : null}
                </div>
              </button>
            ))}
            {!loading && items.length === 0 ? (
              <div className="p-6 text-sm text-tertiary">No circulars yet. Create one.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface overflow-hidden elev-card">
          <div className="px-6 py-4 border-b border-border bg-surface-muted/40 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-tertiary">
              {isEditing ? "Edit circular" : "Create circular"}
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <Button variant="outline" onClick={onDelete} disabled={saving} className="rounded-full">
                  <Trash2 className="size-4 mr-2" /> Delete
                </Button>
              ) : null}
              <Button onClick={onSave} disabled={saving} className="rounded-full">
                <Save className="size-4 mr-2" /> {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium text-tertiary">Title</div>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Registration opens for Primal 2026…"
                />
              </div>
              <div>
                <div className="text-xs font-medium text-tertiary">Kind</div>
                <Select value={draft.kind} onValueChange={(v) => setDraft((d) => ({ ...d, kind: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose kind" />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-tertiary">Subtitle (optional)</div>
              <Input value={draft.subtitle} onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))} placeholder="e.g. Athletes & gyms" />
            </div>

            <div>
              <div className="text-xs font-medium text-tertiary">Body</div>
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                rows={6}
                placeholder="Write the circular text…"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium text-tertiary">Cover image URL (optional)</div>
                <Input value={draft.coverImageUrl} onChange={(e) => setDraft((d) => ({ ...d, coverImageUrl: e.target.value }))} placeholder="https://…" />
              </div>
              <div>
                <div className="text-xs font-medium text-tertiary">Pinned</div>
                <div className="mt-2 flex items-center justify-between rounded-2xl border border-border bg-surface-muted/40 px-4 py-3">
                  <div className="text-sm">Pin to top</div>
                  <Switch checked={draft.pinned} onCheckedChange={(v) => setDraft((d) => ({ ...d, pinned: v }))} />
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium text-tertiary">CTA label (optional)</div>
                <Input value={draft.ctaLabel} onChange={(e) => setDraft((d) => ({ ...d, ctaLabel: e.target.value }))} placeholder="Register" />
              </div>
              <div>
                <div className="text-xs font-medium text-tertiary">CTA URL (optional)</div>
                <Input value={draft.ctaUrl} onChange={(e) => setDraft((d) => ({ ...d, ctaUrl: e.target.value }))} placeholder="/register or https://…" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium text-tertiary">Show from (optional)</div>
                <Input type="datetime-local" value={draft.showFrom} onChange={(e) => setDraft((d) => ({ ...d, showFrom: e.target.value }))} />
              </div>
              <div>
                <div className="text-xs font-medium text-tertiary">Show until (optional)</div>
                <Input type="datetime-local" value={draft.showUntil} onChange={(e) => setDraft((d) => ({ ...d, showUntil: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-tertiary">Publish</div>
              <div className="mt-2 flex items-center justify-between rounded-2xl border border-border bg-surface-muted/40 px-4 py-3">
                <div className="text-sm">Visible on public website</div>
                <Switch checked={draft.isPublished} onCheckedChange={(v) => setDraft((d) => ({ ...d, isPublished: v }))} />
              </div>
              <div className="mt-2 text-[11px] text-tertiary">
                Tip: You can schedule visibility using “Show from / until”.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

