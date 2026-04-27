import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Image as ImageIcon, Plus, RefreshCcw, Save, Star, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { PageSectionHeader, ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";
import { useLocale } from "@/context/LocaleContext";

function emptyDraft() {
  return {
    name: "",
    description: "",
    slug: "",
    tournamentId: "",
    isPublic: true,
  };
}

export default function AdminAlbums() {
  const locale = useLocale();
  const [albums, setAlbums] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const selected = useMemo(() => albums.find((a) => a.id === selectedId) || null, [albums, selectedId]);

  async function refresh() {
    setLoading(true);
    try {
      const [{ data: albumsData, error: albumsError }, { data: tournamentsData, error: tournamentsError }] = await Promise.all([
        api.adminListAlbums(),
        api.adminTournaments({ includeArchived: true }),
      ]);
      if (albumsError) throw new Error(albumsError.message || "Failed to load albums");

      const nextAlbums = (albumsData?.items || []).filter(Boolean);
      setAlbums(nextAlbums);
      if (tournamentsError) {
        setTournaments([]);
      } else {
        setTournaments((tournamentsData?.tournaments || tournamentsData?.items || []).filter(Boolean));
      }

      if (selectedId && !nextAlbums.some((a) => a?.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (err) {
      toast.error(err?.message || "Failed to load albums");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancel = false;
    (async () => {
      try {
        const { data, error } = await api.adminGetAlbum(selectedId);
        if (error) throw new Error(error.message || "Failed to load album");
        if (!cancel) setDetail(data?.album || null);
      } catch (err) {
        if (!cancel) toast.error(err?.message || "Failed to load album");
      }
    })();
    return () => { cancel = true; };
  }, [selectedId, albums]);

  function startNew() {
    setSelectedId(null);
    setDraft(emptyDraft());
  }

  function startEdit(album) {
    setSelectedId(album.id);
    setDraft({
      name: album.name || "",
      description: album.description || "",
      slug: album.slug || "",
      tournamentId: album.tournamentId || "",
      isPublic: album.isPublic !== false,
    });
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) { toast.error("Album name is required"); return; }
    setSaving(true);
    try {
      const body = {
        name,
        description: draft.description || null,
        slug: draft.slug || null,
        tournamentId: draft.tournamentId || null,
        isPublic: !!draft.isPublic,
      };
      if (selectedId) {
        const { error } = await api.adminUpdateAlbum(selectedId, body);
        if (error) throw new Error(error.message || "Failed to update album");
        toast.success("Album updated");
      } else {
        const { data, error } = await api.adminCreateAlbum(body);
        if (error) throw new Error(error.message || "Failed to create album");
        const createdAlbumId = data?.album?.id;
        if (!createdAlbumId) throw new Error("Album created but response was incomplete");
        toast.success("Album created");
        setSelectedId(createdAlbumId);
      }
      await refresh();
    } catch (err) {
      toast.error(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(album) {
    if (!confirm(`Delete album "${album.name}"? Photos will be hidden. Data is preserved (soft delete).`)) return;
    try {
      const { error } = await api.adminDeleteAlbum(album.id);
      if (error) throw new Error(error.message || "Delete failed");
      toast.success("Album deleted");
      if (selectedId === album.id) setSelectedId(null);
      await refresh();
    } catch (err) {
      toast.error(err?.message || "Delete failed");
    }
  }

  async function uploadPhotos(files) {
    if (!selectedId || !files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { error } = await api.adminUploadAlbumPhoto(selectedId, { file });
        if (error) throw new Error(error.message || "Upload failed");
      }
      toast.success(`${files.length} photo(s) uploaded`);
      // refresh detail
      const { data, error } = await api.adminGetAlbum(selectedId);
      if (error) throw new Error(error.message || "Failed to refresh album");
      setDetail(data?.album || null);
      await refresh();
    } catch (err) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function setCover(photoId) {
    try {
      const { error: updateError } = await api.adminUpdateAlbum(selectedId, { coverPhotoId: photoId });
      if (updateError) throw new Error(updateError.message || "Update failed");
      toast.success("Cover updated");
      const { data, error } = await api.adminGetAlbum(selectedId);
      if (error) throw new Error(error.message || "Failed to refresh album");
      setDetail(data?.album || null);
      await refresh();
    } catch (err) {
      toast.error(err?.message || "Update failed");
    }
  }

  async function deletePhoto(photoId) {
    if (!confirm("Remove this photo?")) return;
    try {
      const { error: deleteError } = await api.adminDeleteAlbumPhoto(selectedId, photoId);
      if (deleteError) throw new Error(deleteError.message || "Delete failed");
      toast.success("Photo removed");
      const { data, error } = await api.adminGetAlbum(selectedId);
      if (error) throw new Error(error.message || "Failed to refresh album");
      setDetail(data?.album || null);
    } catch (err) {
      toast.error(err?.message || "Delete failed");
    }
  }

  return (
    <ResponsivePageShell className="space-y-6">
      <PageSectionHeader
        eyebrow={locale?.t("adminAlbums.eyebrow", "Primal Academy") ?? "Primal Academy"}
        title={locale?.t("pages.adminAlbums.title", "Photo albums") ?? "Photo albums"}
        description={locale?.t("adminAlbums.description", "Curate tournament photo albums. Albums can be tied to a season and published to the public site.") ?? "Curate tournament photo albums. Albums can be tied to a season and published to the public site."}
      />

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-border bg-surface elev-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{locale?.t("nav.albums", "Albums") ?? "Albums"} ({albums.length})</h2>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={refresh}>
                <RefreshCcw className="size-4" />
              </Button>
              <Button size="sm" onClick={startNew}>
                <Plus className="size-4" /> {locale?.t("adminAlbums.new", "New") ?? "New"}
              </Button>
            </div>
          </div>
          {loading ? <SectionLoader /> : (
            <ul className="space-y-2">
              {albums.length === 0 && (
                <li className="text-sm text-secondary-muted px-2 py-4 text-center">{locale?.t("adminAlbums.empty", "No albums yet.") ?? "No albums yet."}</li>
              )}
              {albums.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    className={`w-full text-left rounded-xl border border-border/60 p-3 hover:bg-surface-muted/50 ${selectedId === a.id ? "ring-2 ring-primary" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      {a.coverUrl ? (
                        <img src={a.coverUrl} alt="" className="h-14 w-14 rounded-lg object-cover border border-border" />
                      ) : (
                        <div className="h-14 w-14 rounded-lg border border-border bg-surface-muted flex items-center justify-center">
                          <ImageIcon className="size-5 text-secondary-muted" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate">{a.name}</div>
                          {a.isPublic
                            ? <Eye className="size-3.5 text-emerald-600" title="Public" />
                            : <EyeOff className="size-3.5 text-secondary-muted" title="Unlisted" />}
                        </div>
                        <div className="text-xs text-secondary-muted truncate">
                          {a.tournamentName || "Unassigned"} · {a.photoCount ?? 0} photo{a.photoCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-3xl border border-border bg-surface elev-card p-6 space-y-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-display text-xl font-semibold">{selectedId ? (locale?.t("adminAlbums.editAlbum", "Edit album") ?? "Edit album") : (locale?.t("adminAlbums.newAlbum", "New album") ?? "New album")}</h2>
              <p className="text-xs text-secondary-muted">{locale?.t("adminAlbums.publicHint", "Albums power `/albums` on the public site.") ?? "Albums power `/albums` on the public site."}</p>
            </div>
            <div className="flex items-center gap-2">
              {selected && (
                <Button variant="ghost" onClick={() => remove(selected)}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              )}
              <Button onClick={save} disabled={saving}>
                <Save className="size-4" /> {saving ? "Saving…" : selectedId ? "Save changes" : "Create album"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Album name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Primal Cup 2026 — Day 1" />
            </div>
            <div className="space-y-1.5">
              <Label>Slug (optional)</Label>
              <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="primal-cup-2026-day-1" />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Optional caption shown on the public gallery page." />
            </div>
            <div className="space-y-1.5">
              <Label>Tournament / season (optional)</Label>
              <Select value={draft.tournamentId || "none"} onValueChange={(v) => setDraft({ ...draft, tournamentId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {tournaments.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted/40 px-4 py-3">
              <div>
                <Label className="text-sm font-medium">Public</Label>
                <p className="text-xs text-secondary-muted">Show this album on the public /albums page.</p>
              </div>
              <Switch checked={!!draft.isPublic} onCheckedChange={(v) => setDraft({ ...draft, isPublic: v })} />
            </div>
          </div>

          {selectedId && (
            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-display text-lg font-semibold">Photos ({detail?.photos?.length || 0})</h3>
                  <p className="text-xs text-secondary-muted">JPEG / PNG / WEBP. Uploaded to {process.env.NEXT_PUBLIC_BLOB_HINT || "Vercel Blob or local disk"}.</p>
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => uploadPhotos(e.target.files)}
                  />
                  <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="size-4" /> {uploading ? "Uploading…" : "Upload photos"}
                  </Button>
                </div>
              </div>

              {!detail?.photos?.length ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-secondary-muted">
                  No photos yet. Upload your first shots.
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {detail.photos.map((p) => (
                    <figure key={p.id} className="group relative overflow-hidden rounded-xl border border-border bg-surface-muted">
                      <img src={p.thumbnailUrl || p.url} alt={p.caption || ""} className="aspect-square w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                        <div className="flex items-center justify-between gap-1">
                          <Button size="sm" variant={detail.coverPhotoId === p.id ? "default" : "secondary"} onClick={() => setCover(p.id)}>
                            <Star className="size-3.5" /> {detail.coverPhotoId === p.id ? "Cover" : "Set cover"}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deletePhoto(p.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </ResponsivePageShell>
  );
}
