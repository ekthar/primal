import { Activity, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ApplicationWorkspace({
  title,
  subtitle,
  status,
  meta,
  banner,
  sections,
  activeSection,
  onSectionChange,
  actions,
  onClose,
}) {
  const visibleSections = sections.filter((section) => !section.hidden);
  const selectedSection = visibleSections.find((section) => section.id === activeSection) || visibleSections[0];

  return (
    <section className="rounded-2xl border border-border bg-surface elev-card overflow-hidden">
      <div className="border-b border-border bg-surface-muted/40 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
              {status}
            </div>
            {subtitle ? <p className="mt-1 text-sm text-secondary-muted">{subtitle}</p> : null}
            {meta?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {meta.map((item) => (
                  <span key={`${item.label}-${item.value}`} className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-secondary-muted">
                    <span className="font-medium text-foreground">{item.label}:</span> {item.value || "-"}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {actions}
            {onClose ? <Button variant="ghost" onClick={onClose}>Close</Button> : null}
          </div>
        </div>
        {banner ? <div className="mt-4">{banner}</div> : null}
      </div>

      <div className="grid lg:grid-cols-[220px_1fr]">
        <nav className="border-b border-border bg-background/50 p-3 lg:border-b-0 lg:border-r">
          <div className="grid gap-1">
            {visibleSections.map((section) => {
              const Icon = section.icon || Activity;
              const active = selectedSection?.id === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSectionChange(section.id)}
                  className={`flex h-11 items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors ${
                    active ? "bg-surface text-foreground shadow-soft" : "text-secondary-muted hover:bg-surface-muted"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                  {section.complete ? <CheckCircle2 className="ml-auto size-3.5 text-emerald-600" /> : null}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="min-w-0 p-4 sm:p-5">
          {selectedSection?.content}
        </div>
      </div>
    </section>
  );
}

export function WorkspacePanel({ title, helper, children, tone = "default" }) {
  const toneClass = tone === "warning"
    ? "border-amber-300/60 bg-amber-50/60"
    : tone === "success"
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-border bg-background/60";

  return (
    <section className={`rounded-2xl border p-4 ${toneClass}`}>
      <div>
        <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
        {helper ? <p className="mt-1 text-sm text-secondary-muted">{helper}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
