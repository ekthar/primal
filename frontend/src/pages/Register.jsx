import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Shield, User, Stethoscope, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { CLUBS, DISCIPLINES, WEIGHT_CLASSES, HERO_IMAGE } from "@/lib/mockData";
import { toast } from "sonner";

const STEPS = [
  { id: 1, label: "Fighter", icon: User },
  { id: 2, label: "Club", icon: Shield },
  { id: 3, label: "Medical", icon: Stethoscope },
  { id: 4, label: "Review", icon: Trophy },
];

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    email: "",
    phone: "",
    discipline: "",
    weight: "",
    weightClass: "",
    club: "",
    record: "",
    medicalDate: "",
    medicalProvider: "",
    notes: "",
    consent: false,
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  const validateStep = () => {
    const e = {};
    if (step === 1) {
      if (!form.firstName) e.firstName = "Required";
      if (!form.lastName) e.lastName = "Required";
      if (!form.dob) e.dob = "Required";
      if (!form.email || !form.email.includes("@")) e.email = "Valid email required";
    }
    if (step === 2) {
      if (!form.club) e.club = "Select a club";
      if (!form.discipline) e.discipline = "Select discipline";
      if (!form.weight) e.weight = "Required";
      if (!form.weightClass) e.weightClass = "Select weight class";
    }
    if (step === 3) {
      if (!form.medicalDate) e.medicalDate = "Medical date required";
      if (!form.medicalProvider) e.medicalProvider = "Provider required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep()) {
      toast.error("Please complete the highlighted fields");
      return;
    }
    setStep((s) => Math.min(STEPS.length, s + 1));
  };
  const prev = () => setStep((s) => Math.max(1, s - 1));

  const submit = () => {
    if (!form.consent) {
      toast.error("You must accept the combat-sport waiver");
      return;
    }
    toast.success("Application submitted — you'll receive status updates by email");
    setTimeout(() => navigate("/applicant"), 800);
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-foreground text-background flex items-center justify-center font-display font-bold text-xs">T</div>
            <span className="font-display font-semibold tracking-tight text-sm">TournamentOS</span>
          </Link>
          <ThemeToggle compact />
        </div>
      </div>

      {/* Hero banner */}
      <div
        className="h-40 border-b border-border relative overflow-hidden"
        style={{ backgroundImage: `linear-gradient(to bottom, hsl(var(--background)/0.3), hsl(var(--background))), url(${HERO_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center 40%" }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-end pb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Season 2026 · Registration</div>
            <h1 className="font-display mt-1 text-3xl sm:text-4xl font-semibold tracking-tight">Register a fighter</h1>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8">
        <div className="relative">
          <div className="absolute left-0 right-0 top-4 h-0.5 bg-border -z-0" />
          <div className="absolute left-0 top-4 h-0.5 bg-foreground transition-all duration-500 ease-ios -z-0" style={{ width: `${progress}%` }} />
          <div className="relative flex justify-between">
            {STEPS.map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-2">
                <div
                  data-testid={`step-indicator-${s.id}`}
                  className={`size-9 rounded-full border flex items-center justify-center transition-all duration-300 ease-ios ${
                    step >= s.id
                      ? "bg-foreground text-background border-foreground"
                      : "bg-surface text-tertiary border-border"
                  }`}
                >
                  {step > s.id ? <Check className="size-4" /> : <s.icon className="size-4" strokeWidth={1.75} />}
                </div>
                <div className={`text-[11px] font-medium ${step >= s.id ? "text-foreground" : "text-tertiary"}`}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="rounded-2xl border border-border bg-surface elev-card p-6 sm:p-10">
          {step === 1 && (
            <div className="space-y-5 animate-slide-up">
              <header>
                <h2 className="font-display text-2xl font-semibold tracking-tight">Fighter details</h2>
                <p className="text-sm text-secondary-muted mt-1">Legal name as it appears on your competition license.</p>
              </header>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="First name" error={errors.firstName}>
                  <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} data-testid="field-firstName" className="h-11 bg-surface" />
                </Field>
                <Field label="Last name" error={errors.lastName}>
                  <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} data-testid="field-lastName" className="h-11 bg-surface" />
                </Field>
                <Field label="Date of birth" error={errors.dob}>
                  <Input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} data-testid="field-dob" className="h-11 bg-surface" />
                </Field>
                <Field label="Email" error={errors.email}>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} data-testid="field-email" className="h-11 bg-surface" />
                </Field>
                <Field label="Phone">
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} data-testid="field-phone" className="h-11 bg-surface" />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-slide-up">
              <header>
                <h2 className="font-display text-2xl font-semibold tracking-tight">Club &amp; discipline</h2>
                <p className="text-sm text-secondary-muted mt-1">Your affiliated club and the division you're competing in.</p>
              </header>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Club" error={errors.club}>
                  <Select value={form.club} onValueChange={(v) => set("club", v)}>
                    <SelectTrigger data-testid="field-club" className="h-11 bg-surface">
                      <SelectValue placeholder="Select your club" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLUBS.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} · {c.city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Discipline" error={errors.discipline}>
                  <Select value={form.discipline} onValueChange={(v) => set("discipline", v)}>
                    <SelectTrigger data-testid="field-discipline" className="h-11 bg-surface">
                      <SelectValue placeholder="Select discipline" />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCIPLINES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Weight (kg)" error={errors.weight}>
                  <Input type="number" step="0.1" value={form.weight} onChange={(e) => set("weight", e.target.value)} data-testid="field-weight" className="h-11 bg-surface" />
                </Field>
                <Field label="Weight class" error={errors.weightClass}>
                  <Select value={form.weightClass} onValueChange={(v) => set("weightClass", v)}>
                    <SelectTrigger data-testid="field-weightClass" className="h-11 bg-surface">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {WEIGHT_CLASSES.map((w) => <SelectItem key={w.id} value={w.id}>{w.label} (≤ {w.max} kg)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Record (W-L-D)">
                    <Input value={form.record} onChange={(e) => set("record", e.target.value)} placeholder="12-3-1" data-testid="field-record" className="h-11 bg-surface" />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-slide-up">
              <header>
                <h2 className="font-display text-2xl font-semibold tracking-tight">Medical clearance</h2>
                <p className="text-sm text-secondary-muted mt-1">We need a valid medical within 180 days of the event date.</p>
              </header>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Medical date" error={errors.medicalDate}>
                  <Input type="date" value={form.medicalDate} onChange={(e) => set("medicalDate", e.target.value)} data-testid="field-medicalDate" className="h-11 bg-surface" />
                </Field>
                <Field label="Provider / Clinic" error={errors.medicalProvider}>
                  <Input value={form.medicalProvider} onChange={(e) => set("medicalProvider", e.target.value)} data-testid="field-medicalProvider" className="h-11 bg-surface" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Additional notes">
                    <Textarea rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Injuries, ongoing treatments, etc." data-testid="field-notes" className="bg-surface" />
                  </Field>
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-border bg-surface-muted/40 p-4 text-sm text-secondary-muted">
                <strong className="text-foreground">Prototype note:</strong> file upload is mocked. In production, attach scans of your medical certificate, blood panel, and ECG.
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 animate-slide-up">
              <header>
                <h2 className="font-display text-2xl font-semibold tracking-tight">Review &amp; submit</h2>
                <p className="text-sm text-secondary-muted mt-1">Confirm everything looks right before submitting to the sanctioning body.</p>
              </header>
              <div className="rounded-xl border border-border bg-surface-muted/40 divide-y divide-border">
                {[
                  ["Name", `${form.firstName || "—"} ${form.lastName || ""}`],
                  ["Date of birth", form.dob || "—"],
                  ["Email", form.email || "—"],
                  ["Club", CLUBS.find((c) => c.id === form.club)?.name || "—"],
                  ["Discipline", form.discipline || "—"],
                  ["Weight", form.weight ? `${form.weight} kg` : "—"],
                  ["Weight class", WEIGHT_CLASSES.find((w) => w.id === form.weightClass)?.label || "—"],
                  ["Medical date", form.medicalDate || "—"],
                  ["Medical provider", form.medicalProvider || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-tertiary font-semibold">{k}</span>
                    <span className="text-sm">{v}</span>
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => set("consent", e.target.checked)}
                  data-testid="field-consent"
                  className="mt-1 size-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-secondary-muted">
                  I accept the combat-sport waiver, confirm my medical information is current and accurate, and acknowledge that sanctioning decisions are final subject to appeal.
                </span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between pt-8 mt-8 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={prev}
              disabled={step === 1}
              data-testid="step-prev"
            >
              <ArrowLeft className="size-4 mr-1" /> Back
            </Button>
            {step < STEPS.length ? (
              <Button type="button" onClick={next} data-testid="step-next" className="bg-foreground text-background hover:bg-foreground/90">
                Continue <ArrowRight className="size-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" onClick={submit} data-testid="step-submit" className="bg-primary hover:bg-primary-hover text-primary-foreground">
                Submit application
              </Button>
            )}
          </div>
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
      {error && (
        <p className="text-[11px] text-red-500 mt-1 animate-slide-down" role="alert">{error}</p>
      )}
    </div>
  );
}
