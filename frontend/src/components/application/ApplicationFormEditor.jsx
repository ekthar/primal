import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import {
  DISCIPLINE_DEFINITIONS,
  EXPERIENCE_LEVELS,
  GENDER_OPTIONS,
  createPreviewEntries,
} from "@/lib/tournamentWorkflow";

/**
 * Rich, registration-form-quality editor for an application.
 *
 * - In `mode="applicant"` AND when both `profile` + `profileValue` are
 *   provided, the "Identity & address" section is editable. The parent is
 *   responsible for PUT /api/profiles/me on save.
 * - In `mode="club"` / `mode="admin"`, the profile section is hidden (no
 *   admin-edits-other-profile endpoint exists today). Only `form_data` is
 *   editable. Parent PATCH /api/applications/:id only.
 *
 * Both sections are fully controlled. The component never calls the API on
 * its own except for the public state / district / pincode lookups used to
 * populate Select options and auto-fill the address.
 */

const DEFAULT_PROFILE_FORM = {
  fullName: "",
  phone: "",
  gender: "",
  dob: "",
  weight: "",
  state: "",
  district: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
};

const DEFAULT_FORM_DATA = {
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

function isFlagged(flaggedSet, ...keys) {
  if (!flaggedSet || flaggedSet.size === 0) return false;
  for (const key of keys) {
    if (flaggedSet.has(normalizeFieldKey(key))) return true;
  }
  return false;
}

function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === "") return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function FlaggedField({ label, htmlFor, flagged, hint, error, children }) {
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        flagged
          ? "border-amber-400 bg-amber-50/40 ring-1 ring-amber-300/60"
          : "border-border bg-background"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor={htmlFor}
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary"
        >
          {label}
        </Label>
        {flagged ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
            <AlertTriangle className="size-3" /> Reviewer flagged
          </span>
        ) : null}
      </div>
      <div className="mt-2">{children}</div>
      {hint ? <div className="mt-1 text-[11px] text-tertiary">{hint}</div> : null}
      {error ? <div className="mt-1 text-[11px] text-red-500">{error}</div> : null}
    </div>
  );
}

/**
 * Pull the editable subset of a profile into the shape the editor expects.
 */
export function pickEditableProfile(profile) {
  if (!profile) return { ...DEFAULT_PROFILE_FORM };
  const meta = profile.metadata || {};
  const addr = meta.address || {};
  const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return {
    fullName,
    phone: meta.phone || profile.phone || "",
    gender: profile.gender || "",
    dob: profile.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : "",
    weight: profile.weight_kg != null ? String(profile.weight_kg) : "",
    state: addr.state || "",
    district: addr.district || "",
    addressLine1: addr.line1 || "",
    addressLine2: addr.line2 || "",
    postalCode: addr.postalCode || "",
  };
}

/**
 * Build a complete `PUT /api/profiles/me` body from the editor form +
 * the original profile (which carries fields the editor doesn't expose,
 * like record_wins / club_id / discipline). The backend Joi schema
 * requires firstName, lastName, nationality, and metadata, so we always
 * send a full payload.
 */
export function serializeProfileForPatch(profileForm, originalProfile) {
  const meta = originalProfile?.metadata || {};
  const { firstName, lastName } = splitName(profileForm.fullName);
  const weightStr = profileForm.weight != null ? String(profileForm.weight).trim() : "";
  const weightNum = weightStr ? Number(weightStr) : null;
  return {
    firstName,
    lastName,
    dateOfBirth: profileForm.dob || null,
    gender: profileForm.gender || null,
    nationality: "India",
    discipline: meta.selectedDisciplines?.[0] || originalProfile?.discipline || null,
    weightKg: Number.isFinite(weightNum) ? weightNum : null,
    weightClass: originalProfile?.weight_class || null,
    recordWins: originalProfile?.record_wins ?? 0,
    recordLosses: originalProfile?.record_losses ?? 0,
    recordDraws: originalProfile?.record_draws ?? 0,
    bio: originalProfile?.bio || null,
    clubId: originalProfile?.club_id || null,
    metadata: {
      ...meta,
      phone: profileForm.phone ? profileForm.phone.trim() : null,
      address: {
        country: "India",
        state: profileForm.state || "",
        district: profileForm.district || "",
        line1: profileForm.addressLine1 || "",
        line2: profileForm.addressLine2 || null,
        postalCode: profileForm.postalCode || "",
      },
    },
  };
}

export function ApplicationFormEditor({
  mode = "applicant",
  profile = null,
  profileValue,
  onProfileChange,
  formDataValue,
  onFormDataChange,
  flaggedFields = null,
  disabled = false,
  idPrefix = "application-edit",
}) {
  const flaggedSet = useMemo(() => buildFlaggedSet(flaggedFields), [flaggedFields]);

  const profileEditable =
    mode === "applicant" && Boolean(profile) && Boolean(profileValue) && Boolean(onProfileChange);

  const formData = useMemo(
    () => ({ ...DEFAULT_FORM_DATA, ...(formDataValue || {}) }),
    [formDataValue],
  );
  const profileForm = useMemo(
    () => ({ ...DEFAULT_PROFILE_FORM, ...(profileValue || {}) }),
    [profileValue],
  );

  function setProfileField(key, val) {
    if (!profileEditable) return;
    onProfileChange({ ...profileForm, [key]: val });
  }

  function setFormDataField(key, val) {
    if (!onFormDataChange) return;
    onFormDataChange({ ...formData, [key]: val });
  }

  // ---- India state / district / pincode lookups ----
  const [stateOptions, setStateOptions] = useState([]);
  const [districtOptions, setDistrictOptions] = useState([]);
  const [pincodeBusy, setPincodeBusy] = useState(false);
  const [pincodeHint, setPincodeHint] = useState("");
  const lastResolvedPin = useRef("");

  // Refs that always point at the freshest profileForm / onProfileChange so
  // the async pincode lookup callback can read and merge against the latest
  // value, not the stale closure from when the effect kicked off. Without
  // this, edits made to other profile fields while the API call is in
  // flight get silently overwritten when the callback resolves.
  const profileFormRef = useRef(profileForm);
  const onProfileChangeRef = useRef(onProfileChange);
  useEffect(() => {
    profileFormRef.current = profileForm;
  }, [profileForm]);
  useEffect(() => {
    onProfileChangeRef.current = onProfileChange;
  }, [onProfileChange]);

  useEffect(() => {
    if (!profileEditable) return undefined;
    let cancelled = false;
    api.publicIndiaStates().then(({ data, error }) => {
      if (cancelled || error) return;
      setStateOptions(data?.states || []);
    });
    return () => {
      cancelled = true;
    };
  }, [profileEditable]);

  useEffect(() => {
    if (!profileEditable || !profileForm.state) {
      setDistrictOptions([]);
      return undefined;
    }
    let cancelled = false;
    api.publicIndiaDistricts(profileForm.state).then(({ data, error }) => {
      if (cancelled || error) return;
      setDistrictOptions(data?.districts || []);
    });
    return () => {
      cancelled = true;
    };
  }, [profileEditable, profileForm.state]);

  useEffect(() => {
    if (!profileEditable) return undefined;
    const pin = (profileForm.postalCode || "").trim();
    if (!pin || pin.length !== 6) {
      setPincodeHint("");
      return undefined;
    }
    if (lastResolvedPin.current === pin) return undefined;
    let cancelled = false;
    setPincodeBusy(true);
    setPincodeHint("Resolving PIN...");
    api.publicIndiaPincodeLookup(pin).then(({ data, error }) => {
      if (cancelled) return;
      setPincodeBusy(false);
      lastResolvedPin.current = pin;
      if (error) {
        setPincodeHint(error.message || "Could not resolve PIN");
        return;
      }
      const result = data?.result || data?.results?.[0];
      if (!result) {
        setPincodeHint("PIN not found");
        return;
      }
      setPincodeHint(
        [result.state, result.district].filter(Boolean).join(" · ") || "PIN resolved",
      );
      // Read the freshest form value and emitter via refs to avoid clobbering
      // edits the user made to other fields while the lookup was in flight.
      const latestForm = profileFormRef.current || {};
      const emit = onProfileChangeRef.current;
      const next = { ...latestForm };
      let dirty = false;
      if (!next.state && result.state) {
        next.state = result.state;
        dirty = true;
      }
      if (!next.district && result.district) {
        next.district = result.district;
        dirty = true;
      }
      if (dirty && emit) emit(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileEditable, profileForm.postalCode]);

  // ---- Live category preview for selected disciplines ----
  const previewSource = useMemo(() => {
    const overrideWeight = formData.weightKg !== "" && formData.weightKg != null
      ? String(formData.weightKg)
      : "";
    const profileWeight = profileForm.weight || (profile?.weight_kg ? String(profile.weight_kg) : "");
    return {
      fullName: profileForm.fullName || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim(),
      gender: profileForm.gender || profile?.gender || "",
      dob: profileForm.dob || (profile?.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : ""),
      weight: overrideWeight || profileWeight,
      experienceLevel: formData.experienceLevel,
      selectedDisciplines: formData.selectedDisciplines || [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profileForm.fullName,
    profileForm.gender,
    profileForm.dob,
    profileForm.weight,
    profile?.first_name,
    profile?.last_name,
    profile?.gender,
    profile?.date_of_birth,
    profile?.weight_kg,
    formData.weightKg,
    formData.experienceLevel,
    formData.selectedDisciplines,
  ]);

  const previewEntries = useMemo(() => createPreviewEntries(previewSource), [previewSource]);

  function toggleDiscipline(id) {
    const list = Array.isArray(formData.selectedDisciplines) ? formData.selectedDisciplines : [];
    const next = list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
    setFormDataField("selectedDisciplines", next);
  }

  return (
    <div className="space-y-6">
      {profileEditable ? (
        <section className="space-y-4">
          <header>
            <h3 className="font-display text-lg font-semibold tracking-tight">
              Identity &amp; address
            </h3>
            <p className="text-xs text-secondary-muted">
              These live on your participant profile. Editing them here updates the profile used by
              every tournament you enter.
            </p>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            <FlaggedField
              label="Full name"
              htmlFor={`${idPrefix}-fullName`}
              flagged={isFlagged(flaggedSet, "fullName", "firstName", "lastName")}
            >
              <Input
                id={`${idPrefix}-fullName`}
                className="h-9 bg-background"
                disabled={disabled}
                value={profileForm.fullName}
                onChange={(event) => setProfileField("fullName", event.target.value)}
              />
            </FlaggedField>

            <FlaggedField
              label="Phone"
              htmlFor={`${idPrefix}-phone`}
              flagged={isFlagged(flaggedSet, "phone")}
            >
              <Input
                id={`${idPrefix}-phone`}
                className="h-9 bg-background"
                inputMode="tel"
                disabled={disabled}
                value={profileForm.phone}
                onChange={(event) => setProfileField("phone", event.target.value)}
              />
            </FlaggedField>

            <FlaggedField
              label="Gender"
              flagged={isFlagged(flaggedSet, "gender")}
            >
              <div className="grid grid-cols-2 gap-2">
                {GENDER_OPTIONS.map((option) => {
                  const active = profileForm.gender === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setProfileField("gender", option.id)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                        active
                          ? "border-foreground bg-surface-muted text-foreground"
                          : "border-border bg-background text-secondary-muted"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </FlaggedField>

            <FlaggedField
              label="Date of birth"
              htmlFor={`${idPrefix}-dob`}
              flagged={isFlagged(flaggedSet, "dob", "dateOfBirth")}
            >
              <Input
                id={`${idPrefix}-dob`}
                type="date"
                className="h-9 bg-background"
                disabled={disabled}
                value={profileForm.dob}
                onChange={(event) => setProfileField("dob", event.target.value)}
              />
            </FlaggedField>

            <FlaggedField
              label="Weight (kg)"
              htmlFor={`${idPrefix}-profileWeight`}
              flagged={isFlagged(flaggedSet, "weight", "weightKg")}
              hint="Used to seed your weight class. Final weight is checked at weigh-in."
            >
              <Input
                id={`${idPrefix}-profileWeight`}
                type="number"
                step="0.1"
                inputMode="decimal"
                className="h-9 bg-background"
                disabled={disabled}
                value={profileForm.weight}
                onChange={(event) => setProfileField("weight", event.target.value)}
              />
            </FlaggedField>

            <FlaggedField
              label="State"
              flagged={isFlagged(flaggedSet, "state", "addressState")}
            >
              <Select
                value={profileForm.state || ""}
                onValueChange={(value) => setProfileField("state", value)}
                disabled={disabled || stateOptions.length === 0}
              >
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue
                    placeholder={stateOptions.length ? "Select state" : "Loading..."}
                  />
                </SelectTrigger>
                <SelectContent>
                  {stateOptions.map((stateName) => (
                    <SelectItem key={stateName} value={stateName}>
                      {stateName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FlaggedField>

            <FlaggedField
              label="District"
              flagged={isFlagged(flaggedSet, "district", "addressDistrict")}
            >
              <Select
                value={profileForm.district || ""}
                onValueChange={(value) => setProfileField("district", value)}
                disabled={disabled || districtOptions.length === 0}
              >
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue
                    placeholder={
                      districtOptions.length
                        ? "Select district"
                        : profileForm.state
                          ? "Loading..."
                          : "Pick state first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {districtOptions.map((districtName) => (
                    <SelectItem key={districtName} value={districtName}>
                      {districtName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FlaggedField>

            <FlaggedField
              label="Postal code"
              htmlFor={`${idPrefix}-postalCode`}
              flagged={isFlagged(flaggedSet, "postalCode", "pincode")}
              hint={pincodeBusy ? "Validating PIN..." : pincodeHint}
            >
              <Input
                id={`${idPrefix}-postalCode`}
                inputMode="numeric"
                maxLength={6}
                className="h-9 bg-background"
                disabled={disabled}
                value={profileForm.postalCode}
                onChange={(event) =>
                  setProfileField(
                    "postalCode",
                    event.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
              />
            </FlaggedField>

            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
              <FlaggedField
                label="Address line 1"
                htmlFor={`${idPrefix}-addressLine1`}
                flagged={isFlagged(flaggedSet, "addressLine1", "address")}
              >
                <Input
                  id={`${idPrefix}-addressLine1`}
                  className="h-9 bg-background"
                  disabled={disabled}
                  value={profileForm.addressLine1}
                  onChange={(event) => setProfileField("addressLine1", event.target.value)}
                />
              </FlaggedField>
              <FlaggedField
                label="Address line 2"
                htmlFor={`${idPrefix}-addressLine2`}
                flagged={isFlagged(flaggedSet, "addressLine2")}
              >
                <Input
                  id={`${idPrefix}-addressLine2`}
                  className="h-9 bg-background"
                  disabled={disabled}
                  value={profileForm.addressLine2}
                  onChange={(event) => setProfileField("addressLine2", event.target.value)}
                />
              </FlaggedField>
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <header>
          <h3 className="font-display text-lg font-semibold tracking-tight">
            Competition entry
          </h3>
          <p className="text-xs text-secondary-muted">
            Select every discipline you intend to compete in. The category preview updates as you
            change weight and experience.
          </p>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          {DISCIPLINE_DEFINITIONS.map((discipline) => {
            const active = (formData.selectedDisciplines || []).includes(discipline.id);
            const previewEntry = previewEntries.find(
              (entry) => entry.disciplineId === discipline.id,
            );
            const flagged = isFlagged(flaggedSet, "selectedDisciplines");
            return (
              <button
                key={discipline.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleDiscipline(discipline.id)}
                className={`rounded-2xl border p-4 text-left transition-colors disabled:opacity-60 ${
                  active
                    ? "border-foreground bg-surface-muted"
                    : "border-border bg-background hover:bg-surface-muted/40"
                } ${flagged ? "ring-2 ring-amber-300/60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-base font-semibold tracking-tight">
                      {discipline.label}
                    </div>
                    <div className="text-xs text-tertiary mt-1">
                      Minimum age {discipline.minAge}
                    </div>
                  </div>
                  <div
                    className={`size-6 rounded-full border flex items-center justify-center ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-transparent"
                    }`}
                  >
                    <Check className="size-3.5" />
                  </div>
                </div>
                {active && previewEntry ? (
                  <div className="mt-3 text-xs">
                    <div
                      className={
                        previewEntry.valid
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-amber-700 dark:text-amber-400"
                      }
                    >
                      {previewEntry.categoryLabel}
                    </div>
                    {!previewEntry.valid && previewEntry.issues?.length ? (
                      <ul className="mt-1 list-disc pl-4 text-tertiary">
                        {previewEntry.issues.map((issue, index) => (
                          <li key={index}>{issue}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FlaggedField
            label="Experience level"
            flagged={isFlagged(flaggedSet, "experienceLevel")}
          >
            <div className="grid grid-cols-3 gap-2">
              {EXPERIENCE_LEVELS.map((level) => {
                const active = formData.experienceLevel === level.id;
                return (
                  <button
                    key={level.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setFormDataField("experienceLevel", level.id)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                      active
                        ? "border-foreground bg-surface-muted text-foreground"
                        : "border-border bg-background text-secondary-muted"
                    }`}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>
          </FlaggedField>

          <FlaggedField
            label="Walking weight (kg)"
            htmlFor={`${idPrefix}-weightKg`}
            flagged={isFlagged(flaggedSet, "weightKg")}
            hint={
              profileEditable
                ? "Optional override for this tournament. Leave blank to use your profile weight."
                : "Used to seed the weight class. The official check happens at weigh-in."
            }
          >
            <Input
              id={`${idPrefix}-weightKg`}
              type="number"
              step="0.1"
              min={20}
              max={250}
              inputMode="decimal"
              className="h-9 bg-background"
              disabled={disabled}
              value={formData.weightKg ?? ""}
              onChange={(event) => setFormDataField("weightKg", event.target.value)}
            />
          </FlaggedField>

          <FlaggedField
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
              className="h-9 bg-background"
              disabled={disabled}
              value={formData.yearsTraining ?? ""}
              onChange={(event) => setFormDataField("yearsTraining", event.target.value)}
            />
          </FlaggedField>

          <FlaggedField
            label="Notes for the reviewer"
            htmlFor={`${idPrefix}-notes`}
            flagged={isFlagged(flaggedSet, "notes")}
            hint="Tell the reviewer what changed or any context they should see first."
          >
            <Textarea
              id={`${idPrefix}-notes`}
              rows={3}
              disabled={disabled}
              className="bg-background"
              value={formData.notes || ""}
              onChange={(event) => setFormDataField("notes", event.target.value)}
            />
          </FlaggedField>
        </div>
      </section>

      <section className="space-y-4">
        <header>
          <h3 className="font-display text-lg font-semibold tracking-tight">
            Corner &amp; emergency contact
          </h3>
          <p className="text-xs text-secondary-muted">
            Required so the medical and ops teams can reach someone if there&apos;s an incident in
            the cage.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <FlaggedField
            label="Corner / coach name"
            htmlFor={`${idPrefix}-cornerCoachName`}
            flagged={isFlagged(flaggedSet, "cornerCoachName")}
          >
            <Input
              id={`${idPrefix}-cornerCoachName`}
              className="h-9 bg-background"
              disabled={disabled}
              value={formData.cornerCoachName || ""}
              onChange={(event) => setFormDataField("cornerCoachName", event.target.value)}
            />
          </FlaggedField>

          <FlaggedField
            label="Corner / coach phone"
            htmlFor={`${idPrefix}-cornerCoachPhone`}
            flagged={isFlagged(flaggedSet, "cornerCoachPhone")}
          >
            <Input
              id={`${idPrefix}-cornerCoachPhone`}
              className="h-9 bg-background"
              inputMode="tel"
              disabled={disabled}
              value={formData.cornerCoachPhone || ""}
              onChange={(event) => setFormDataField("cornerCoachPhone", event.target.value)}
            />
          </FlaggedField>

          <FlaggedField
            label="Emergency contact name"
            htmlFor={`${idPrefix}-emergencyContactName`}
            flagged={isFlagged(flaggedSet, "emergencyContactName")}
          >
            <Input
              id={`${idPrefix}-emergencyContactName`}
              className="h-9 bg-background"
              disabled={disabled}
              value={formData.emergencyContactName || ""}
              onChange={(event) => setFormDataField("emergencyContactName", event.target.value)}
            />
          </FlaggedField>

          <FlaggedField
            label="Relation"
            htmlFor={`${idPrefix}-emergencyContactRelation`}
            flagged={isFlagged(flaggedSet, "emergencyContactRelation")}
          >
            <Input
              id={`${idPrefix}-emergencyContactRelation`}
              className="h-9 bg-background"
              disabled={disabled}
              placeholder="Parent, spouse, sibling..."
              value={formData.emergencyContactRelation || ""}
              onChange={(event) =>
                setFormDataField("emergencyContactRelation", event.target.value)
              }
            />
          </FlaggedField>

          <FlaggedField
            label="Emergency contact phone"
            htmlFor={`${idPrefix}-emergencyContactPhone`}
            flagged={isFlagged(flaggedSet, "emergencyContactPhone")}
          >
            <Input
              id={`${idPrefix}-emergencyContactPhone`}
              className="h-9 bg-background"
              inputMode="tel"
              disabled={disabled}
              value={formData.emergencyContactPhone || ""}
              onChange={(event) =>
                setFormDataField("emergencyContactPhone", event.target.value)
              }
            />
          </FlaggedField>

          <FlaggedField
            label="Medical notes"
            htmlFor={`${idPrefix}-medicalNotes`}
            flagged={isFlagged(flaggedSet, "medicalNotes")}
            hint="Allergies, medications, conditions to brief the medic."
          >
            <Textarea
              id={`${idPrefix}-medicalNotes`}
              rows={3}
              disabled={disabled}
              className="bg-background"
              value={formData.medicalNotes || ""}
              onChange={(event) => setFormDataField("medicalNotes", event.target.value)}
            />
          </FlaggedField>
        </div>
      </section>
    </div>
  );
}

export default ApplicationFormEditor;
