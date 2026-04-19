export function EmptyState({ icon: Icon, title, description, action, testId }) {
  return (
    <div
      data-testid={testId || "empty-state"}
      className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl border border-dashed border-border bg-surface/40"
    >
      {Icon && (
        <div className="size-12 rounded-xl bg-surface-muted flex items-center justify-center mb-4 text-tertiary">
          <Icon className="size-5" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-secondary-muted max-w-sm text-balance">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export default EmptyState;
