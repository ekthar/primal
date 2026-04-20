import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, ArrowRight, Check, FileCheck2, Shield, Trophy, User } from "lucide-react";
import { toast } from "sonner";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { DISCIPLINE_DEFINITIONS, EXPERIENCE_LEVELS, GENDER_OPTIONS, createPreviewEntries } from "@/lib/tournamentWorkflow";
import { HERO_IMAGE } from "@/lib/mockData";

const STEPS = [
  { id: 1, label: "Account", icon: User },
  { id: 2, label: "Registration", icon: Trophy },
  { id: 3, label: "Documents", icon: Shield },
  { id: 4, label: "Review", icon: FileCheck2 },
];

export default function Register() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const isClubTrack = router.query.track === "club";
  const [step, setStep] = useState(1);
  const [tournamentId, setTournamentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "demo1234",
    gender: "",
    dob: "",
    phone: "",
    weight: "",
    nationality: "",
    experienceLevel: "",
    selectedDisciplines: [],
    notes: "",
    clubName: "",
    clubSlug: "",
    clubCity: "",
    clubCountry: "",
  });
  const [documents, setDocuments] = useState({ medical: null, photo_id: null, consent: null });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    api.publicTournaments().then(({ data }) => {
      const first = data?.tournaments?.[0];
      if (first) setTournamentId(first.id);
    });
  }, []);

  const entryPreview = useMemo(() => createPreviewEntries(form), [form]);
  const validEntries = entryPreview.filter((entry) => entry.valid);

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: null }));
  };

  const toggleDiscipline = (disciplineId) => {
    setForm((current) => {
      const exists = current.selectedDisciplines.includes(disciplineId);
      return {
        ...current,
        selectedDisciplines: exists
          ? current.selectedDisciplines.filter((id) => id !== disciplineId)
          : [...current.selectedDisciplines, disciplineId],
      };
    });
  };

  const validateStep = () => {
    const nextErrors = {};
    if (step === 1) {
      if (!form.fullName) nextErrors.fullName = "Required";
      if (!form.email || !form.email.includes("@")) nextErrors.email = "Valid email required";
      if (!form.password || form.password.length < 8) nextErrors.password = "Minimum 8 characters";
      if (isClubTrack) {
        if (!form.clubName) nextErrors.clubName = "Required";
        if (!form.clubSlug) nextErrors.clubSlug = "Required";
      } else {
        if (!form.gender) nextErrors.gender = "Required";
        if (!form.dob) nextErrors.dob = "Required";
        if (!form.weight) nextErrors.weight = "Required";
      }
    }
    if (step === 2 && !isClubTrack) {
      if (form.selectedDisciplines.length === 0) nextErrors.selectedDisciplines = "Select at least one discipline";
      if (entryPreview.some((entry) => !entry.valid)) nextErrors.selectedDisciplines = "Fix the invalid discipline selection";
      if (!form.experienceLevel) nextErrors.experienceLevel = "Required";
      if (!tournamentId) nextErrors.tournament = "Tournament is loading";
    }
    if (step === 3 && !isClubTrack) {
      if (!documents.medical) nextErrors.medical = "Medical certificate required";
      if (!documents.photo_id) nextErrors.photo_id = "Photo ID required";
      if (!documents.consent) nextErrors.consent = "Signed consent required";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const next = () => {
    if (!validateStep()) {
      toast.error("Please complete the highlighted fields");
      return;
    }
    setStep((current) => Math.min(STEPS.length, current + 1));
  };

  const prev = () => setStep((current) => Math.max(1, current - 1));

  const submit = async () => {
    if (!validateStep()) {
      toast.error("Review the registration before submitting");
      return;
    }
    setLoading(true);
    const [firstName, ...rest] = form.fullName.trim().split(" ");
    const lastName = rest.join(" ") || firstName;

    const { user, error } = await registerUser({
      email: form.email,
      password: form.password,
      name: form.fullName,
      role: isClubTrack ? "club" : "applicant",
      locale: "en",
    });
    if (error) {
      setLoading(false);
      toast.error(error.message || "Registration failed");
      return;
    }

    if (isClubTrack) {
      const clubRes = await api.createClub({
        name: form.clubName,
        slug: form.clubSlug,
        city: form.clubCity,
        country: form.clubCountry,
        metadata: { contactName: form.fullName, phone: form.phone },
      });
      setLoading(false);
      if (clubRes.error) {
        toast.error(clubRes.error.message || "Club onboarding failed");
        return;
      }
      toast.success("Club onboarding submitted");
      router.push("/club");
      return;
    }

    const profileRes = await api.upsertMyProfile({
      firstName,
      lastName,
      dateOfBirth: form.dob,
      gender: form.gender,
      nationality: form.nationality || null,
      discipline: form.selectedDisciplines[0] || null,
      weightKg: Number(form.weight),
      weightClass: validEntries[0]?.weightClassLabel || null,
      recordWins: 0,
      recordLosses: 0,
      recordDraws: 0,
      bio: form.notes || null,
      metadata: {
        selectedDisciplines: form.selectedDisciplines,
        experienceLevel: form.experienceLevel,
        phone: form.phone,
      },
    });
    if (profileRes.error) {
      setLoading(false);
      toast.error(profileRes.error.message || "Profile save failed");
      return;
    }

    const appRes = await api.createApplication({
      tournamentId,
      formData: {
        selectedDisciplines: form.selectedDisciplines,
        experienceLevel: form.experienceLevel,
        notes: form.notes,
      },
    });
    if (appRes.error) {
      setLoading(false);
      toast.error(appRes.error.message || "Application draft failed");
      return;
    }

    const applicationId = appRes.data.application.id;
    for (const [kind, file] of Object.entries(documents)) {
      const uploadRes = await api.uploadApplicationDocument(applicationId, { file, kind, label: file.name });
      if (uploadRes.error) {
        setLoading(false);
        toast.error(uploadRes.error.message || `Failed to upload ${kind}`);
        return;
      }
    }

    const submitRes = await api.submitApplication(applicationId);
    setLoading(false);
    if (submitRes.error) {
      toast.error(submitRes.error.message || "Submission failed");
      return;
    }
    toast.success(`Application submitted with ${validEntries.length} selected discipline${validEntries.length === 1 ? "" : "s"}`);
    router.push("/applicant");
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-foreground text-background flex items-center justify-center font-display font-bold text-xs">T</div>
            <span className="font-display font-semibold tracking-tight text-sm">TournamentOS</span>
          </Link>
          <ThemeToggle compact />
        </div>
      </div>

      <div
        className="h-44 border-b border-border relative overflow-hidden"
        style={{ backgroundImage: `linear-gradient(to bottom, hsl(var(--background)/0.2), hsl(var(--background))), url(${HERO_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center 30%" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-end pb-7">
          <div className="max-w-2xl">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">
              Season 2026 · {isClubTrack ? "Club onboarding" : "Self-registration"}
            </div>
            <h1 className="font-display mt-1 text-3xl sm:text-4xl font-semibold tracking-tight">
              {isClubTrack ? "Create your club workspace." : "Apply once and track review in real time."}
            </h1>
            <p className="text-sm text-secondary-muted mt-2">
              {isClubTrack
                ? "Register the club, establish the manager account, and unlock club-scoped participant workflows."
                : "Create an account, save your reusable profile, upload required documents, and submit directly into the review queue."}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8">
        <div className="relative">
          <div className="absolute left-0 right-0 top-4 h-0.5 bg-border -z-0" />
          <div className="absolute left-0 top-4 h-0.5 bg-foreground transition-all duration-500 ease-ios -z-0" style={{ width: `${progress}%` }} />
          <div className="relative flex justify-between gap-2">
            {STEPS.map((item) => (
              <div key={item.id} className="flex flex-col items-center gap-2 text-center">
                <div className={`size-9 rounded-full border flex items-center justify-center ${step >= item.id ? "bg-foreground text-background border-foreground" : "bg-surface text-tertiary border-border"}`}>
                  {step > item.id ? <Check className="size-4" /> : <item.icon className="size-4" strokeWidth={1.75} />}
                </div>
                <div className={`text-[11px] font-medium ${step >= item.id ? "text-foreground" : "text-tertiary"}`}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-[1.5fr_0.9fr] gap-5 items-start">
          <div className="rounded-3xl border border-border bg-surface elev-card p-6 sm:p-8">
            {step === 1 && (
              <section className="space-y-5">
                <header>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">{isClubTrack ? "Manager account and club identity" : "Account and participant profile"}</h2>
                </header>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label={isClubTrack ? "Manager full name" : "Full name"} error={errors.fullName}><Input value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} className="h-11 bg-surface" /></Field>
                  <Field label="Email" error={errors.email}><Input value={form.email} onChange={(e) => setField("email", e.target.value)} className="h-11 bg-surface" /></Field>
                  <Field label="Password" error={errors.password}><Input type="password" value={form.password} onChange={(e) => setField("password", e.target.value)} className="h-11 bg-surface" /></Field>
                  <Field label="Phone"><Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} className="h-11 bg-surface" /></Field>
                  {isClubTrack ? (
                    <>
                      <Field label="Club name" error={errors.clubName}><Input value={form.clubName} onChange={(e) => setField("clubName", e.target.value)} className="h-11 bg-surface" /></Field>
                      <Field label="Club slug" error={errors.clubSlug}><Input value={form.clubSlug} onChange={(e) => setField("clubSlug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className="h-11 bg-surface" /></Field>
                      <Field label="City"><Input value={form.clubCity} onChange={(e) => setField("clubCity", e.target.value)} className="h-11 bg-surface" /></Field>
                      <Field label="Country"><Input value={form.clubCountry} onChange={(e) => setField("clubCountry", e.target.value.toUpperCase())} className="h-11 bg-surface" /></Field>
                    </>
                  ) : (
                    <>
                      <Field label="Gender" error={errors.gender}>
                        <div className="grid grid-cols-2 gap-2">
                          {GENDER_OPTIONS.map((option) => (
                            <button key={option.id} type="button" onClick={() => setField("gender", option.id)} className={`rounded-xl border px-4 py-3 text-sm font-medium ${form.gender === option.id ? "border-foreground bg-surface-muted text-foreground" : "border-border bg-background text-secondary-muted"}`}>{option.label}</button>
                          ))}
                        </div>
                      </Field>
                      <Field label="Date of birth" error={errors.dob}><Input type="date" value={form.dob} onChange={(e) => setField("dob", e.target.value)} className="h-11 bg-surface" /></Field>
                      <Field label="Weight (kg)" error={errors.weight}><Input type="number" step="0.1" value={form.weight} onChange={(e) => setField("weight", e.target.value)} className="h-11 bg-surface" /></Field>
                      <Field label="Nationality"><Input value={form.nationality} onChange={(e) => setField("nationality", e.target.value)} className="h-11 bg-surface" /></Field>
                    </>
                  )}
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-5">
                <header>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">{isClubTrack ? "Club readiness" : "Application details"}</h2>
                  <p className="text-sm text-secondary-muted mt-1">
                    {isClubTrack ? "This sets up the club workspace and manager account." : "Selected disciplines are stored in the application payload for reviewer context."}
                  </p>
                </header>
                {isClubTrack ? (
                  <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-secondary-muted">
                    Club onboarding will create the authenticated club account and the club entity in one submission.
                  </div>
                ) : (
                  <>
                    <Field label="Experience level" error={errors.experienceLevel}>
                      <div className="grid grid-cols-3 gap-2">
                        {EXPERIENCE_LEVELS.map((level) => (
                          <button key={level.id} type="button" onClick={() => setField("experienceLevel", level.id)} className={`rounded-xl border px-3 py-3 text-sm font-medium ${form.experienceLevel === level.id ? "border-foreground bg-surface-muted text-foreground" : "border-border bg-background text-secondary-muted"}`}>{level.label}</button>
                        ))}
                      </div>
                    </Field>
                    <div className="grid md:grid-cols-2 gap-3">
                      {DISCIPLINE_DEFINITIONS.map((discipline) => {
                        const active = form.selectedDisciplines.includes(discipline.id);
                        const preview = entryPreview.find((entry) => entry.disciplineId === discipline.id);
                        return (
                          <button key={discipline.id} type="button" onClick={() => toggleDiscipline(discipline.id)} className={`rounded-2xl border p-4 text-left ${active ? "border-foreground bg-surface-muted" : "border-border bg-background hover:bg-surface-muted/40"}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-display text-lg font-semibold tracking-tight">{discipline.label}</div>
                                <div className="text-xs text-tertiary mt-1">Minimum age {discipline.minAge}</div>
                              </div>
                              <div className={`size-6 rounded-full border flex items-center justify-center ${active ? "border-foreground bg-foreground text-background" : "border-border text-transparent"}`}>
                                <Check className="size-3.5" />
                              </div>
                            </div>
                            {active && preview && <div className="mt-4 text-sm text-secondary-muted">{preview.categoryLabel}</div>}
                          </button>
                        );
                      })}
                    </div>
                    {errors.selectedDisciplines && <p className="text-[11px] text-red-500">{errors.selectedDisciplines}</p>}
                    <Field label="Notes for reviewer">
                      <Textarea rows={4} value={form.notes} onChange={(e) => setField("notes", e.target.value)} className="bg-surface" />
                    </Field>
                  </>
                )}
              </section>
            )}

            {step === 3 && (
              <section className="space-y-5">
                <header>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">{isClubTrack ? "Review onboarding details" : "Required documents"}</h2>
                  <p className="text-sm text-secondary-muted mt-1">
                    {isClubTrack ? "Review the club setup before creating the workspace." : "These uploads are required for submission and enforced by the backend."}
                  </p>
                </header>
                {isClubTrack ? (
                  <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-secondary-muted">
                    Club onboarding does not require document uploads in this phase.
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-3 gap-4">
                    {[
                      ["medical", "Medical certificate"],
                      ["photo_id", "Photo ID"],
                      ["consent", "Signed consent"],
                    ].map(([key, label]) => (
                      <Field key={key} label={label} error={errors[key]}>
                        <Input type="file" onChange={(event) => setDocuments((current) => ({ ...current, [key]: event.target.files?.[0] || null }))} className="h-11 bg-surface" />
                      </Field>
                    ))}
                  </div>
                )}
              </section>
            )}

            {step === 4 && (
              <section className="space-y-5">
                <header>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Review and submit</h2>
                </header>
                <div className="rounded-2xl border border-border bg-surface-muted/40 divide-y divide-border">
                  {[
                    ["Name", form.fullName || "-"],
                    ["Email", form.email || "-"],
                    ["Track", isClubTrack ? "Club onboarding" : "Individual application"],
                    ["Club", isClubTrack ? form.clubName || "-" : "Self-registration"],
                    ["Disciplines", isClubTrack ? "-" : (form.selectedDisciplines.map((disciplineId) => DISCIPLINE_DEFINITIONS.find((discipline) => discipline.id === disciplineId)?.label).join(", ") || "-")],
                    ["Documents", isClubTrack ? "Not required" : `${Object.values(documents).filter(Boolean).length}/3 uploaded`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                      <span className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</span>
                      <span className="text-sm text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="flex items-center justify-between pt-8 mt-8 border-t border-border">
              <Button type="button" variant="ghost" onClick={prev} disabled={step === 1}>
                <ArrowLeft className="size-4 mr-1" /> Back
              </Button>
              {step < STEPS.length ? (
                <Button type="button" onClick={next} className="bg-foreground text-background hover:bg-foreground/90">
                  Continue <ArrowRight className="size-4 ml-1" />
                </Button>
              ) : (
                <Button type="button" onClick={submit} disabled={loading} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                  {loading ? "Submitting..." : "Submit"}
                </Button>
              )}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="rounded-3xl border border-border bg-surface elev-card p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{isClubTrack ? "Workspace" : "Application preview"}</div>
              <div className="font-display text-3xl font-semibold tracking-tight mt-2">{isClubTrack ? "Club" : validEntries.length}</div>
              <p className="text-sm text-secondary-muted mt-1">
                {isClubTrack ? "Creates the manager account plus club entity." : "Selected disciplines are captured in the submitted application payload."}
              </p>
            </div>
            {!isClubTrack && (
              <div className="rounded-3xl border border-border bg-surface elev-card p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Discipline preview</div>
                <div className="mt-4 space-y-3">
                  {entryPreview.map((entry) => (
                    <div key={entry.disciplineId} className="rounded-2xl border border-border bg-background/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{entry.disciplineLabel}</span>
                        <span className={`text-[11px] font-semibold uppercase tracking-wider ${entry.valid ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400"}`}>
                          {entry.valid ? "Ready" : "Review"}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-secondary-muted">{entry.categoryLabel}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}
