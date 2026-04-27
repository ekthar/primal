import { cn } from "@/lib/utils";

export function ResponsivePageShell({ children, className = "" }) {
  return (
    <div className={cn("relative mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8", className)}>
      {children}
    </div>
  );
}

export function PageSectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
  compact = false,
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", compact && "gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{eyebrow}</div>
        ) : null}
        {title ? (
          <h1 className={cn("font-display font-semibold tracking-tight mt-1 text-2xl sm:text-3xl lg:text-4xl", compact && "text-xl sm:text-2xl")}>
            {title}
          </h1>
        ) : null}
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-secondary-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </div>
  );
}

export function ResponsiveTable({ children, className = "", mobileClassName = "" }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-border bg-background/50", mobileClassName)}>
      <div className={cn("min-w-[720px]", className)}>{children}</div>
    </div>
  );
}

export function DataCardList({ items, renderItem, className = "" }) {
  if (!items?.length) return null;
  return <div className={cn("space-y-3", className)}>{items.map(renderItem)}</div>;
}

export function StickyActionBar({ children, className = "" }) {
  return (
    <div
      className={cn(
        "sticky z-20 mt-4 rounded-2xl border border-border bg-background/92 p-3 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.12)]",
        "bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-4",
        className,
      )}
    >
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
