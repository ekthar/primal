import { FileText, Send, Eye, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

const ICONS = {
  draft: FileText,
  submitted: Send,
  under_review: Eye,
  needs_correction: AlertTriangle,
  approved: CheckCircle2,
  rejected: XCircle,
};

const COLORS = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  submitted: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  under_review: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  needs_correction: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  rejected: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function Timeline({ events = [] }) {
  return (
    <ol data-testid="timeline" className="relative space-y-0">
      {events.map((e, i) => {
        const Icon = ICONS[e.kind] || FileText;
        const isLast = i === events.length - 1;
        return (
          <li key={i} className="relative pl-10 pb-5">
            {!isLast && (
              <span className="absolute left-[17px] top-9 bottom-0 w-px bg-border" aria-hidden />
            )}
            <span className={`absolute left-0 top-0 size-9 rounded-full flex items-center justify-center ${COLORS[e.kind] || COLORS.draft}`}>
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <div className="pt-1">
              <p className="text-sm font-medium text-foreground">{e.label}</p>
              <p className="text-xs text-secondary-muted mt-0.5">
                {e.actor} · <span className="font-mono tabular-nums">{formatTime(e.at)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default Timeline;
