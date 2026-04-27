import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DISCIPLINE_DEFINITIONS, EXPERIENCE_LEVELS } from "@/lib/tournamentWorkflow";

/**
 * Shared editor for the JSON `form_data` blob attached to an application.
 *
 * Used by:
 *   - <ApplicantDashboard /> needs_correction panel
 *   - <ClubDashboard /> View / Edit drawer
 *   - <ReviewerWorkbench /> admin "Edit application" dialog
 *
 * The value/onChange contract is fully controlled: the parent owns merging
 * the result back into `application.form_data` and PATCHing
 * /api/applications/:id. Unknown keys on `value` are preserved so a reviewer
 * who flags a custom field (e.g. {"customField": "..."}) doesn't lose data.
 *
 * Each field whose key appears in `flaggedFields` (matched case-insensitive
 * and normalized between camelCase / snake_case) gets an amber ring + chip
 * so the user can see which inputs the reviewer asked them to fix.
 */

const DEFAULT_VALUE = {
  selectedDisciplines: [],
  experienceLevel: "",
  yearsTraining: "",
  weightKg: "",
  cornerCoachName: "",
  cornerCoachPhone: "",
  emergencyContactName: "",
  emergencyContactRelation: "",
  emergencyContactPhone: "",
  medicalNotes: "",
  notes: "",
};

function normalizeFieldKey(key) {
  if (!key) return "";
  return String(key)
    .replace(/[._\s-]+/g, "")
    .toLowerCase();
}

function buildFlaggedSet(flaggedFields) {
  if (!Array.isArray(flaggedFields)) return new Set();
  return new Set(flaggedFields.map(normalizeFieldKey).filter(Boolean));
}

function isFlagged(flaggedSet, key) {
  if (!flaggedSet || flaggedSet.size === 0) return false;
  return flaggedSet.has(normalizeFieldKey(key));
}

function FieldShell({ label, htmlFor, flagged, hint, children }) {
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        flagged
          ? "border-amber-400 bg-amber-50/40 ring-1 ring-amber-300/60"
          : "border-border bg-background"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary"
        >
          {label}
        </label>
        {flagged ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
            <AlertTriangle className="size-3" /> Reviewer flagged
          </span>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
      {hint ? <div className="mt-1 text-[11px] text-tertiary">{hint}</div> : null}
    </div>
  );
}

export function ApplicationEditFields({
  value,
  onChange,
  flaggedFields,
  disabled = false,
  showSectionHeadings = true,
  idPrefix = "application-edit",
}) {
  const merged = useMemo(() => ({ ...DEFAULT_VALUE, ...(value || {}) }), [value]);
  const flaggedSet = useMemo(() => buildFlaggedSet(flaggedFields), [flaggedFields]);

  function setField(key, next) {
    if (disabled) return;
    onChange({ ...(value || {}), [key]: next });
  }

  function toggleDiscipline(id) {
    const list = Array.isArray(merged.selectedDisciplines) ? merged.selectedDisciplines : [];
    const next = list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
    setField("selectedDisciplines", next);
  }

  return (
    <div className="space-y-5">
      {showSectionHeadings ? (
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary">
          Competition entry
        </div>
      ) : null}

      <FieldShell
        label="Selected disciplines"
        flagged={isFlagged(flaggedSet, "selectedDisciplines")}
        hint="Tap to toggle. The first selected discipline becomes the primary entry."
      >
        <div className="flex flex-wrap gap-2">
          {DISCIPLINE_DEFINITIONS.map((discipline) => {
            const selected = (merged.selectedDisciplines || []).includes(discipline.id);
            return (
              <button
                key={discipline.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleDiscipline(discipline.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-60 ${
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-secondary-muted hover:bg-surface-muted"
                }`}
              >
                {discipline.label}
              </button>
            );
          })}
        </div>
      </FieldShell>

      <div className="grid gap-3 sm:grid-cols-2">
        <FieldShell
          label="Experience level"
          htmlFor={`${idPrefix}-experienceLevel`}
          flagged={isFlagged(flaggedSet, "experienceLevel")}
        >
          <select
            id={`${idPrefix}-experienceLevel`}
            disabled={disabled}
            value={merged.experienceLevel || ""}
            onChange={(event) => setField("experienceLevel", event.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm disabled:opacity-60"
          >
            <option value="">—</option>
            {EXPERIENCE_LEVELS.map((level) => (
              <option key={level.id} value={level.id}>
                {level.label}
              </option>
            ))}
          </select>
        </FieldShell>

        <FieldShell
          label="Years training"
          htmlFor={`${idPrefix}-yearsTraining`}
          flagged={isFlagged(flaggedSet, "yearsTraining")}
        >
          <Input
            id={`${idPrefix}-yearsTraining`}
            type="number"
            min={0}
            max={60}
            step={1}
            inputMode="numeric"
            disabled={disabled}
            className="h-9 bg-background"
            value={merged.yearsTraining ?? ""}
            onChange={(event) => setField("yearsTraining", event.target.value)}
          />
        </FieldShell>

        <FieldShell
          label="Walking weight (kg)"
          htmlFor={`${idPrefix}-weightKg`}
          flagged={isFlagged(flaggedSet, "weightKg")}
          hint="Used to seed the weight class. The official check happens at weigh-in."
        >
          <Input
            id={`${idPrefix}-weightKg`}
            type="number"
            min={20}
            max={250}
            step="0.1"
            inputMode="decimal"
            disabled={disabled}
            className="h-9 bg-background"
            value={merged.weightKg ?? ""}
            onChange={(event) => setField("weightKg", event.target.value)}
          />
        </FieldShell>

        <FieldShell
          label="Notes for the reviewer"
          htmlFor={`${idPrefix}-notes`}
          flagged={isFlagged(flaggedSet, "notes")}
          hint="Tell the reviewer what you fixed or any context they should see first."
        >
          <Textarea
            id={`${idPrefix}-notes`}
            rows={3}
            disabled={disabled}
            className="bg-background"
            value={merged.notes || ""}
            onChange={(event) => setField("notes", event.target.value)}
          />
        </FieldShell>
      </div>

      {showSectionHeadings ? (
        <div className="pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary">
          Corner & emergency contact
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <FieldShell
          label="Corner / coach name"
          htmlFor={`${idPrefix}-cornerCoachName`}
          flagged={isFlagged(flaggedSet, "cornerCoachName")}
        >
          <Input
            id={`${idPrefix}-cornerCoachName`}
            disabled={disabled}
            className="h-9 bg-background"
            value={merged.cornerCoachName || ""}
            onChange={(event) => setField("cornerCoachName", event.target.value)}
          />
        </FieldShell>

        <FieldShell
          label="Corner / coach phone"
          htmlFor={`${idPrefix}-cornerCoachPhone`}
          flagged={isFlagged(flaggedSet, "cornerCoachPhone")}
        >
          <Input
            id={`${idPrefix}-cornerCoachPhone`}
            disabled={disabled}
            inputMode="tel"
            className="h-9 bg-background"
            value={merged.cornerCoachPhone || ""}
            onChange={(event) => setField("cornerCoachPhone", event.target.value)}
          />
        </FieldShell>

        <FieldShell
          label="Emergency contact name"
          htmlFor={`${idPrefix}-emergencyContactName`}
          flagged={isFlagged(flaggedSet, "emergencyContactName")}
        >
          <Input
            id={`${idPrefix}-emergencyContactName`}
            disabled={disabled}
            className="h-9 bg-background"
            value={merged.emergencyContactName || ""}
            onChange={(event) => setField("emergencyContactName", event.target.value)}
          />
        </FieldShell>

        <FieldShell
          label="Relation"
          htmlFor={`${idPrefix}-emergencyContactRelation`}
          flagged={isFlagged(flaggedSet, "emergencyContactRelation")}
        >
          <Input
            id={`${idPrefix}-emergencyContactRelation`}
            disabled={disabled}
            placeholder="Parent, spouse, sibling…"
            className="h-9 bg-background"
            value={merged.emergencyContactRelation || ""}
            onChange={(event) => setField("emergencyContactRelation", event.target.value)}
          />
        </FieldShell>

        <FieldShell
          label="Emergency contact phone"
          htmlFor={`${idPrefix}-emergencyContactPhone`}
          flagged={isFlagged(flaggedSet, "emergencyContactPhone")}
        >
          <Input
            id={`${idPrefix}-emergencyContactPhone`}
            disabled={disabled}
            inputMode="tel"
            className="h-9 bg-background"
            value={merged.emergencyContactPhone || ""}
            onChange={(event) => setField("emergencyContactPhone", event.target.value)}
          />
        </FieldShell>

        <FieldShell
          label="Medical notes (allergies, medications, conditions)"
          htmlFor={`${idPrefix}-medicalNotes`}
          flagged={isFlagged(flaggedSet, "medicalNotes")}
        >
          <Textarea
            id={`${idPrefix}-medicalNotes`}
            rows={3}
            disabled={disabled}
            className="bg-background"
            value={merged.medicalNotes || ""}
            onChange={(event) => setField("medicalNotes", event.target.value)}
          />
        </FieldShell>
      </div>
    </div>
  );
}

/**
 * Pull the editable subset of an application's form_data into the shape
 * <ApplicationEditFields /> expects. Callers can spread the result onto their
 * local edit state and pass the same object back to the API after save.
 */
export function pickEditableFormData(application) {
  const fd = application?.form_data || {};
  return {
    selectedDisciplines: Array.isArray(fd.selectedDisciplines) ? [...fd.selectedDisciplines] : [],
    experienceLevel: fd.experienceLevel || "",
    yearsTraining: fd.yearsTraining ?? "",
    weightKg: fd.weightKg ?? "",
    cornerCoachName: fd.cornerCoachName || "",
    cornerCoachPhone: fd.cornerCoachPhone || "",
    emergencyContactName: fd.emergencyContactName || "",
    emergencyContactRelation: fd.emergencyContactRelation || "",
    emergencyContactPhone: fd.emergencyContactPhone || "",
    medicalNotes: fd.medicalNotes || "",
    notes: fd.notes || "",
  };
}

/**
 * Coerce the controlled form values into a payload safe to PATCH back. Empty
 * strings are kept as null so the backend can distinguish "cleared by user"
 * from "field not changed" (the backend merges, so unsent keys are preserved).
 */
export function serializeFormDataForPatch(value) {
  const next = { ...(value || {}) };
  for (const key of Object.keys(next)) {
    if (typeof next[key] === "string" && next[key].trim() === "") {
      next[key] = null;
    }
  }
  if (next.yearsTraining != null && next.yearsTraining !== "") {
    const parsed = Number(next.yearsTraining);
    next.yearsTraining = Number.isFinite(parsed) ? parsed : null;
  }
  if (next.weightKg != null && next.weightKg !== "") {
    const parsed = Number(next.weightKg);
    next.weightKg = Number.isFinite(parsed) ? parsed : null;
  }
  return next;
}

export default ApplicationEditFields;
