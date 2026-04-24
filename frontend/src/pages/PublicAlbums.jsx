import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, Image as ImageIcon } from "lucide-react";
import { api } from "@/lib/api";
import { PageSectionHeader, ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";
import { SectionLoader } from "@/components/shared/PrimalLoader";

export default function PublicAlbums() {
  const router = useRouter();
  const { id } = router.query;
  const [albums, setAlbums] = useState([]);
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState(null);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      try {
        if (id) {
          const { album } = await api.publicGetAlbum(id);
          if (!cancel) setAlbum(album);
        } else {
          const { albums } = await api.publicListAlbums();
          if (!cancel) setAlbums(albums || []);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("album load failed", err);
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => { cancel = true; };
  }, [id]);

  if (loading) {
    return <ResponsivePageShell><SectionLoader /></ResponsivePageShell>;
  }

  if (id && album) {
    return (
      <ResponsivePageShell className="space-y-6">
        <Link href="/albums" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> All albums
        </Link>
        <PageSectionHeader
          eyebrow={album.tournamentName || "Primal Academy"}
          title={album.name}
          description={album.description || ""}
        />
        {!album.photos?.length ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-secondary-muted">
            No photos published yet.
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {album.photos.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setViewerIndex(idx)}
                className="group overflow-hidden rounded-xl border border-border bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img
                  src={p.thumbnailUrl || p.url}
                  alt={p.caption || album.name}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition group-hover:scale-[1.02]"
                />
              </button>
            ))}
          </div>
        )}

        {viewerIndex !== null && album.photos[viewerIndex] && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Photo viewer"
            className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setViewerIndex(null)}
          >
            <img
              src={album.photos[viewerIndex].url}
              alt={album.photos[viewerIndex].caption || album.name}
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setViewerIndex(null)}
              className="absolute top-4 right-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white backdrop-blur hover:bg-white/20"
            >
              Close
            </button>
          </div>
        )}
      </ResponsivePageShell>
    );
  }

  return (
    <ResponsivePageShell className="space-y-6">
      <PageSectionHeader
        eyebrow="Primal Academy"
        title="Tournament albums"
        description="Match day photos from Primal Academy events."
      />

      {!albums.length ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-secondary-muted">
          <ImageIcon className="mx-auto size-6 mb-2 text-secondary-muted" />
          No albums published yet. Check back after the next tournament.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((a) => (
            <Link
              key={a.id}
              href={`/albums?id=${a.id}`}
              className="group overflow-hidden rounded-2xl border border-border bg-surface elev-card hover:shadow-lg transition"
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                {a.coverUrl ? (
                  <img
                    src={a.coverUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <ImageIcon className="size-8 text-secondary-muted" />
                  </div>
                )}
              </div>
              <div className="p-4 space-y-1">
                <div className="text-[10px] uppercase tracking-[0.16em] text-secondary-muted">
                  {a.tournamentName || "Academy"}
                </div>
                <div className="font-display text-lg font-semibold">{a.name}</div>
                <div className="text-xs text-secondary-muted">
                  {a.photoCount ?? 0} photo{a.photoCount === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </ResponsivePageShell>
  );
}
