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

/**
 * DashboardSection — a consistently-styled card panel for dashboards.
 *
 * Wraps content in a rounded-3xl border + bg-surface card with a
 * normalized header (eyebrow + title + optional description + actions)
 * and standard padding that steps down on phones.
 *
 *   <DashboardSection
 *     eyebrow="Submissions"
 *     title="Recent applications"
 *     actions={<Button>Refresh</Button>}
 *   >
 *     ...content...
 *   </DashboardSection>
 */
export function DashboardSection({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
  compact = false,
}) {
  const hasHeader = eyebrow || title || description || actions;
  return (
    <section
      className={cn(
        "rounded-3xl border border-border bg-surface p-4 sm:p-6 elev-card",
        compact && "p-3 sm:p-4",
        className,
      )}
    >
      {hasHeader ? (
        <header className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{eyebrow}</div>
            ) : null}
            {title ? (
              <h2 className="font-display text-lg sm:text-xl font-semibold tracking-tight mt-0.5">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-2xl text-xs sm:text-sm text-secondary-muted">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * KpiGrid — a uniform responsive grid for KPI / stat cards.
 *
 *   <KpiGrid columns={4}>
 *     <Kpi ... />
 *     <Kpi ... />
 *   </KpiGrid>
 */
export function KpiGrid({ children, columns = 4, className = "" }) {
  const colClass = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
    6: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
  }[columns] || "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:gap-4", colClass, className)}>
      {children}
    </div>
  );
}

export function StickyActionBar({ children, className = "" }) {
  // The 5rem mobile offset clears the AppShell MobileBottomNav (z-30) so the
  // sticky action bar (z-20) is always tappable above it. md+ has no bottom
  // nav and uses bottom-4.
  return (
    <div
      className={cn(
        "sticky z-20 mt-4 rounded-2xl border border-border bg-background/92 p-3 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.12)]",
        "bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4",
        className,
      )}
    >
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
