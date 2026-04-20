import { ENTRY_STATUS_LABELS } from "@/lib/tournamentWorkflow";

const TONE = {
  pending: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
  rejected: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60",
};

const DOT = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
};

export default function EntryStatusPill({ status, size = "sm" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${TONE[status] || TONE.pending} ${
        size === "xs" ? "text-[10px] px-2 py-0.5" : ""
      }`}
    >
      <span className={`size-1.5 rounded-full ${DOT[status] || DOT.pending}`} />
      {ENTRY_STATUS_LABELS[status] || status}
    </span>
  );
}
