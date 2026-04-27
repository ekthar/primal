import { STATUS_LABELS } from "@/lib/mockData";
import { useLocale } from "@/context/LocaleContext";

const DOT_COLORS = {
  draft: "bg-zinc-400",
  submitted: "bg-blue-500",
  under_review: "bg-amber-500",
  needs_correction: "bg-orange-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  season_closed: "bg-slate-500",
  appeal: "bg-fuchsia-500",
};

export function StatusPill({ status, size = "sm", showDot = true, testId }) {
  const locale = useLocale();
  const fallback = STATUS_LABELS[status] || status;
  const label = locale?.t(`status.${status}`, fallback) ?? fallback;
  return (
    <span
      data-testid={testId || `status-pill-${status}`}
      className={`pill pill-${status} ${size === "xs" ? "text-[10px] px-2 py-0.5" : ""}`}
    >
      {showDot && (
        <span className={`pill-dot ${DOT_COLORS[status] || "bg-zinc-400"} ${status === "under_review" ? "animate-pulse" : ""}`} />
      )}
      {label}
    </span>
  );
}

export default StatusPill;
