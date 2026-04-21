import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function Spinner({ className = "" }) {
  return <Loader2 className={cn("size-4 animate-spin text-primary", className)} />;
}

export function FullPageLoader({ title = "Primal", message = "Preparing your fight desk..." }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-surface/90 backdrop-blur-xl p-8 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-foreground text-background flex items-center justify-center font-display font-bold text-lg">
            P
          </div>
          <div>
            <div className="font-display text-2xl font-semibold tracking-tight">{title}</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-tertiary">Fight operations platform</div>
          </div>
        </div>
        <div className="mt-8 flex items-center gap-3 text-sm text-secondary-muted">
          <Spinner className="size-5" />
          <span>{message}</span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Skeleton className="h-16 rounded-2xl bg-primary/8" />
          <Skeleton className="h-16 rounded-2xl bg-primary/8" />
          <Skeleton className="h-16 rounded-2xl bg-primary/8" />
        </div>
      </div>
    </div>
  );
}

export function SectionLoader({ title = "Loading", description = "Fetching the latest event data...", cards = 3, rows = 4, compact = false }) {
  return (
    <div className={cn("rounded-3xl border border-border bg-surface elev-card p-6", compact && "p-5")}>
      <div className="flex items-center gap-3">
        <Spinner />
        <div>
          <div className="font-display text-xl font-semibold tracking-tight">{title}</div>
          <div className="text-sm text-secondary-muted mt-1">{description}</div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-background/50 p-4 space-y-3">
            <Skeleton className="h-4 w-2/3 rounded-full" />
            <Skeleton className="h-10 w-1/3 rounded-xl" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-5/6 rounded-full" />
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-background/40 px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/5 rounded-full" />
              <Skeleton className="h-3 w-1/3 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function InlineLoadingLabel({ loading, loadingText, children }) {
  if (!loading) return children;
  return (
    <>
      <Spinner />
      <span>{loadingText}</span>
    </>
  );
}
