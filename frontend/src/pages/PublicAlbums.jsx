import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Image as ImageIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { ResponsivePageShell } from "@/components/shared/ResponsivePrimitives";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { useLocale } from "@/context/LocaleContext";
import PublicHero from "@/components/landing/anime/PublicHero";
import StaggerGrid from "@/components/landing/anime/StaggerGrid";
import MagneticCard from "@/components/landing/anime/MagneticCard";

export default function PublicAlbums() {
  const locale = useLocale();
  const router = useRouter();
  const { id } = router.query;
  const reduced = useReducedMotion();
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
          const { data, error } = await api.publicGetAlbum(id);
          if (error) throw new Error(error.message || "Failed to load album");
          if (!cancel) setAlbum(data?.album || null);
        } else {
          const { data, error } = await api.publicListAlbums();
          if (error) throw new Error(error.message || "Failed to load albums");
          if (!cancel) setAlbums((data?.albums || []).filter(Boolean));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("album load failed", err);
        if (!cancel) {
          setAlbum(null);
          setAlbums([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => { cancel = true; };
  }, [id]);

  // Lightbox keyboard navigation.
  useEffect(() => {
    if (viewerIndex === null || !album?.photos?.length) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setViewerIndex(null);
      else if (event.key === "ArrowRight") setViewerIndex((i) => (i + 1) % album.photos.length);
      else if (event.key === "ArrowLeft") setViewerIndex((i) => (i - 1 + album.photos.length) % album.photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, album]);

  if (loading) {
    return <ResponsivePageShell><SectionLoader /></ResponsivePageShell>;
  }

  if (id && album) {
    return (
      <ResponsivePageShell className="space-y-10">
        <Link href="/albums" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> {locale?.t("publicAlbums.allAlbums", "All albums") ?? "All albums"}
        </Link>

        <PublicHero
          eyebrow={album.tournamentName || "Primal Academy"}
          titleParts={[{ text: album.name }]}
          subtitle={album.description || `${album.photos?.length || 0} match-day photos`}
          accent="rgba(225,29,72,0.32)"
        />

        {!album.photos?.length ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-secondary-muted">
            No photos published yet.
          </div>
        ) : (
          <StaggerGrid className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4" grid={[3, 1]}>
            {album.photos.map((photo, idx) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                albumName={album.name}
                onOpen={() => setViewerIndex(idx)}
              />
            ))}
          </StaggerGrid>
        )}

        <Lightbox
          open={viewerIndex !== null}
          photos={album.photos || []}
          index={viewerIndex ?? 0}
          albumName={album.name}
          onClose={() => setViewerIndex(null)}
          onPrev={() => setViewerIndex((i) => (i - 1 + (album.photos?.length || 1)) % (album.photos?.length || 1))}
          onNext={() => setViewerIndex((i) => (i + 1) % (album.photos?.length || 1))}
          reduced={reduced}
        />
      </ResponsivePageShell>
    );
  }

  return (
    <ResponsivePageShell className="space-y-10">
      <PublicHero
        eyebrow={locale?.t("adminAlbums.eyebrow", "Primal Academy") ?? "Primal Academy"}
        titleParts={[
          { text: locale?.t("publicAlbums.titleA", "Tournament") ?? "Tournament" },
          { text: locale?.t("publicAlbums.titleB", "albums") ?? "albums", italic: true },
        ]}
        subtitle={locale?.t("publicAlbums.description", "Match day photos from Primal Academy events.") ?? "Match day photos from Primal Academy events."}
      />

      {!albums.length ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-secondary-muted">
          <ImageIcon className="mx-auto size-6 mb-2 text-secondary-muted" />
          No albums published yet. Check back after the next tournament.
        </div>
      ) : (
        <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" grid={[3, 1]}>
          {albums.map((a) => (
            <MagneticCard key={a.id} maxTilt={6} className="group">
              <Link
                href={`/albums?id=${a.id}`}
                className="block overflow-hidden rounded-2xl border border-border bg-surface elev-card hover:shadow-xl transition"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-surface-muted">
                  {a.coverUrl ? (
                    <img
                      src={a.coverUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
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
            </MagneticCard>
          ))}
        </StaggerGrid>
      )}
    </ResponsivePageShell>
  );
}

function PhotoTile({ photo, albumName, onOpen }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
      className="group relative overflow-hidden rounded-xl border border-border bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <img
        src={photo.thumbnailUrl || photo.url}
        alt={photo.caption || albumName}
        loading="lazy"
        className="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.05]"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition group-hover:opacity-100"
        aria-hidden
      />
    </motion.button>
  );
}

function Lightbox({ open, photos, index, albumName, onClose, onPrev, onNext, reduced }) {
  const photo = photos[index];
  return (
    <AnimatePresence>
      {open && photo ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={photo.id ?? index}
              src={photo.url}
              alt={photo.caption || albumName}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
              className="max-h-full max-w-full object-contain rounded-lg shadow-[0_30px_120px_rgba(0,0,0,0.5)]"
              onClick={(e) => e.stopPropagation()}
            />
          </AnimatePresence>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            aria-label="Close"
            className="absolute top-4 right-4 inline-flex items-center justify-center size-10 rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onPrev(); }}
                aria-label="Previous photo"
                className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-12 rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onNext(); }}
                aria-label="Next photo"
                className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-12 rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
              >
                <ChevronRight className="size-6" />
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white tabular-nums backdrop-blur">
                {index + 1} / {photos.length}
              </div>
            </>
          ) : null}
          {photo.caption ? (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 max-w-2xl rounded-full bg-white/10 px-4 py-1 text-sm text-white backdrop-blur text-center">
              {photo.caption}
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
