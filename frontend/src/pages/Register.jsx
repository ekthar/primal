import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, ArrowRight, Check, FileCheck2, Shield, Trophy, User } from "lucide-react";
import { toast } from "sonner";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import LocaleToggle from "@/components/shared/LocaleToggle";
import api from "@/lib/api";
import { splitPersonName } from "@/lib/person";
import { DISCIPLINE_DEFINITIONS, EXPERIENCE_LEVELS, GENDER_OPTIONS, createPreviewEntries } from "@/lib/tournamentWorkflow";
import { HERO_IMAGE } from "@/lib/mockData";
import DocumentInputField from "@/components/scanner/DocumentInputField";

const STEPS = [
  { id: 1, key: "account", icon: User },
  { id: 2, key: "registration", icon: Trophy },
  { id: 3, key: "documents", icon: Shield },
  { id: 4, key: "review", icon: FileCheck2 },
];

export default function Register() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const locale = useLocale();
  const isHindi = locale?.locale === "hi";
  const rt = (en, hi) => (isHindi ? hi : en);
  const isClubTrack = router.query.track === "club";
  const [step, setStep] = useState(1);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [tournamentId, setTournamentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [stateOptions, setStateOptions] = useState([]);
  const [districtOptions, setDistrictOptions] = useState([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [pincodeLookupBusy, setPincodeLookupBusy] = useState(false);
  const [pincodeResolution, setPincodeResolution] = useState(null);
  const [pincodeHint, setPincodeHint] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    gender: "",
    dob: "",
    phone: "",
    weight: "",
    nationality: "India",
    state: "",
    district: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    experienceLevel: "",
    selectedDisciplines: [],
    notes: "",
    clubName: "",
    clubSlug: "",
    clubCity: "",
    clubCountry: "India",
  });
  const [documents, setDocuments] = useState({ medical: null, photo_id: null, consent: null });
  const [documentSources, setDocumentSources] = useState({ medical: null, photo_id: null, consent: null });
  const [idNumberLast4, setIdNumberLast4] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let ignore = false;
    async function loadTournaments() {
      setTournamentsLoading(true);
      const { data } = await api.publicTournaments();
      if (ignore) return;
      const items = data?.tournaments || [];
      setTournaments(items);
      const firstOpenTournament = items.find((item) => item.registrationOpen);
      if (firstOpenTournament) setTournamentId((current) => current || firstOpenTournament.id);
      else if (items.length > 0) setTournamentId((current) => current || items[0].id);
      setTournamentsLoading(false);
    }
    loadTournaments();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadIndiaStates() {
      setLoadingStates(true);
      const { data, error } = await api.publicIndiaStates();
      if (ignore) return;
      if (error) {
        setStateOptions([]);
        toast.error(error.message || rt("Unable to load India states", "भारत के राज्य लोड नहीं हो सके"));
      } else {
        setStateOptions(data?.states || []);
      }
      setLoadingStates(false);
    }

    loadIndiaStates();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!form.state) {
      setDistrictOptions([]);
      return;
    }

    let ignore = false;
    async function loadDistricts() {
      setLoadingDistricts(true);
      const { data, error } = await api.publicIndiaDistricts(form.state);
      if (ignore) return;
      if (error) {
        setDistrictOptions([]);
        setErrors((current) => ({ ...current, district: rt("District list unavailable for selected state", "चयनित राज्य के लिए जिले उपलब्ध नहीं हैं") }));
      } else {
        setDistrictOptions(data?.districts || []);
      }
      setLoadingDistricts(false);
    }

    loadDistricts();
    return () => {
      ignore = true;
    };
  }, [form.state]);

  useEffect(() => {
    const pin = String(form.postalCode || "").replace(/\D/g, "");

    if (!pin) {
      setPincodeResolution(null);
      setPincodeHint("");
      setPincodeLookupBusy(false);
      return;
    }

    if (!/^[1-9][0-9]{5}$/.test(pin)) {
      setPincodeResolution(null);
      setPincodeHint(rt("Enter a valid 6-digit India PIN", "मान्य 6-अंकीय भारतीय PIN दर्ज करें"));
      setPincodeLookupBusy(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setPincodeLookupBusy(true);
      const { data, error } = await api.publicIndiaPincodeLookup(pin);
      if (cancelled) return;

      setPincodeLookupBusy(false);
      if (error || !data?.location) {
        setPincodeResolution(null);
        setPincodeHint(error?.message || rt("PIN not found in India directory", "भारतीय निर्देशिका में PIN नहीं मिला"));
        return;
      }

      const location = data.location;
      setPincodeResolution({
        pincode: location.pincode,
        state: location.state,
        district: location.district,
      });
      setPincodeHint(
        location.offices?.length
          ? `${location.state}, ${location.district} - ${location.offices[0]}`
          : `${location.state}, ${location.district}`
      );
      setForm((current) => ({
        ...current,
        nationality: "India",
        state: location.state,
        district: location.district,
        postalCode: location.pincode,
      }));
      setErrors((current) => ({ ...current, postalCode: null, state: null, district: null, nationality: null }));
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.postalCode]);

  const entryPreview = useMemo(() => createPreviewEntries(form), [form]);
  const validEntries = entryPreview.filter((entry) => entry.valid);
  const openTournaments = useMemo(
    () => tournaments.filter((tournament) => tournament.registrationOpen),
    [tournaments]
  );
  const applicantRegistrationClosed = !isClubTrack && !tournamentsLoading && openTournaments.length === 0;

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: null }));
  };

  const setState = (value) => {
    setForm((current) => ({ ...current, state: value, district: "" }));
    setErrors((current) => ({ ...current, state: null, district: null }));
    setPincodeResolution(null);
    setPincodeHint("");
  };

  const setDistrict = (value) => {
    setForm((current) => ({ ...current, district: value }));
    setErrors((current) => ({ ...current, district: null }));
    setPincodeResolution(null);
    setPincodeHint("");
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
      if (!form.fullName) nextErrors.fullName = rt("Required", "आवश्यक है");
      if (!form.email || !form.email.includes("@")) nextErrors.email = rt("Valid email required", "मान्य ईमेल आवश्यक है");
      if (!form.password || form.password.length < 8) nextErrors.password = rt("Minimum 8 characters", "कम से कम 8 अक्षर");
      if (isClubTrack) {
        if (!form.clubName) nextErrors.clubName = rt("Required", "आवश्यक है");
        if (!form.clubSlug) nextErrors.clubSlug = rt("Required", "आवश्यक है");
        if (!form.state) nextErrors.state = rt("Required", "आवश्यक है");
        if (!form.district) nextErrors.district = rt("Required", "आवश्यक है");
        if (!/^[1-9][0-9]{5}$/.test(form.postalCode)) {
          nextErrors.postalCode = rt("Enter a valid 6-digit India PIN", "मान्य 6-अंकीय भारतीय PIN दर्ज करें");
        }
        if (!pincodeResolution) {
          nextErrors.postalCode = nextErrors.postalCode || rt("PIN autolocation is required", "PIN ऑटो-लोकेशन आवश्यक है");
        }
        if (pincodeResolution && (
          pincodeResolution.pincode !== form.postalCode
          || pincodeResolution.state.toLowerCase() !== String(form.state || "").toLowerCase()
          || pincodeResolution.district.toLowerCase() !== String(form.district || "").toLowerCase()
        )) {
          nextErrors.postalCode = rt("State and district must match the resolved PIN", "राज्य और जिला PIN से मेल खाने चाहिए");
        }
      } else {
        if (!form.gender) nextErrors.gender = rt("Required", "आवश्यक है");
        if (!form.dob) nextErrors.dob = rt("Required", "आवश्यक है");
        if (!form.weight || Number(form.weight) <= 0) nextErrors.weight = rt("Enter a valid weight", "मान्य वजन दर्ज करें");
        if (form.nationality !== "India") nextErrors.nationality = rt("Country must be India", "देश भारत होना चाहिए");
        if (!form.state) nextErrors.state = rt("Required", "आवश्यक है");
        if (!form.district) nextErrors.district = rt("Required", "आवश्यक है");
        if (!form.addressLine1.trim()) nextErrors.addressLine1 = rt("Required", "आवश्यक है");
        if (!/^[1-9][0-9]{5}$/.test(form.postalCode)) {
          nextErrors.postalCode = rt("Enter a valid 6-digit India PIN", "मान्य 6-अंकीय भारतीय PIN दर्ज करें");
        }
        if (!pincodeResolution) {
          nextErrors.postalCode = nextErrors.postalCode || rt("PIN autolocation is required", "PIN ऑटो-लोकेशन आवश्यक है");
        }
        if (pincodeResolution && (
          pincodeResolution.pincode !== form.postalCode
          || pincodeResolution.state.toLowerCase() !== String(form.state || "").toLowerCase()
          || pincodeResolution.district.toLowerCase() !== String(form.district || "").toLowerCase()
        )) {
          nextErrors.postalCode = rt("State and district must match the resolved PIN", "राज्य और जिला PIN से मेल खाने चाहिए");
        }
      }
    }
    if (step === 2 && !isClubTrack) {
      if (form.selectedDisciplines.length === 0) nextErrors.selectedDisciplines = rt("Select at least one discipline", "कम से कम एक डिसिप्लिन चुनें");
      if (entryPreview.some((entry) => !entry.valid)) nextErrors.selectedDisciplines = rt("Fix the invalid discipline selection", "अमान्य डिसिप्लिन चयन ठीक करें");
      if (!tournamentId && !tournamentsLoading && tournaments.length > 0) nextErrors.tournament = rt("Select a tournament", "एक टूर्नामेंट चुनें");
    }
    if (step === 3 && !isClubTrack) {
      if (!documents.medical) nextErrors.medical = rt("Medical certificate required", "मेडिकल सर्टिफिकेट आवश्यक है");
      if (!documents.photo_id) nextErrors.photo_id = rt("Photo ID required", "फोटो ID आवश्यक है");
      if (!documents.consent) nextErrors.consent = rt("Signed consent required", "हस्ताक्षरित सहमति आवश्यक है");
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const next = () => {
    if (applicantRegistrationClosed) {
      toast.error(rt("No season is currently open for new participant registration", "नई प्रतिभागी रजिस्ट्रेशन के लिए अभी कोई सीज़न खुला नहीं है"));
      return;
    }
    if (!validateStep()) {
      toast.error(rt("Please complete the highlighted fields", "कृपया हाइलाइट किए गए फ़ील्ड पूरे करें"));
      return;
    }
    setStep((current) => Math.min(STEPS.length, current + 1));
  };

  const prev = () => setStep((current) => Math.max(1, current - 1));

  const submit = async () => {
    if (applicantRegistrationClosed) {
      toast.error(rt("No season is currently open for new participant registration", "नई प्रतिभागी रजिस्ट्रेशन के लिए अभी कोई सीज़न खुला नहीं है"));
      return;
    }
    if (!validateStep()) {
      toast.error(rt("Review the registration before submitting", "सबमिट करने से पहले रजिस्ट्रेशन की समीक्षा करें"));
      return;
    }
    setLoading(true);
    const { firstName, lastName } = splitPersonName(form.fullName);

    let selectedTournamentId = tournamentId;
    if (!isClubTrack && !selectedTournamentId) {
      const { data } = await api.publicTournaments();
      const fallbackTournamentId = data?.tournaments?.find((item) => item.registrationOpen)?.id;
      if (fallbackTournamentId) {
        selectedTournamentId = fallbackTournamentId;
        setTournamentId(fallbackTournamentId);
      }
    }
    if (!isClubTrack && !selectedTournamentId) {
      setLoading(false);
      toast.error(rt("No active tournament available. Please contact admin.", "कोई सक्रिय टूर्नामेंट उपलब्ध नहीं है। कृपया एडमिन से संपर्क करें।"));
      return;
    }

    const { user, error } = await registerUser({
      email: form.email,
      password: form.password,
      name: form.fullName,
      role: isClubTrack ? "club" : "applicant",
      locale: locale?.locale || "en",
    });
    if (error) {
      setLoading(false);
      if (error.code === "CONFLICT") {
        toast.error(rt("Email already registered. Please sign in instead.", "ईमेल पहले से पंजीकृत है। कृपया साइन इन करें।"));
        return;
      }
      toast.error(error.message || rt("Registration failed", "रजिस्ट्रेशन विफल रहा"));
      return;
    }

    if (isClubTrack) {
      const clubRes = await api.createClub({
        name: form.clubName,
        slug: form.clubSlug,
        city: form.clubCity || form.district,
        country: "India",
        metadata: {
          contactName: form.fullName,
          phone: form.phone,
          address: {
            country: "India",
            state: form.state,
            district: form.district,
            postalCode: form.postalCode,
          },
        },
      });
      setLoading(false);
      if (clubRes.error) {
        toast.error(clubRes.error.message || rt("Club onboarding failed", "क्लब ऑनबोर्डिंग विफल रही"));
        return;
      }
      toast.success(rt("Club onboarding submitted", "क्लब ऑनबोर्डिंग सबमिट हो गई"));
      router.push("/club");
      return;
    }

    const profileRes = await api.upsertMyProfile({
      firstName,
      lastName,
      dateOfBirth: form.dob,
      gender: form.gender,
      nationality: "India",
      discipline: form.selectedDisciplines[0] || null,
      weightKg: Number(form.weight),
      weightClass: validEntries[0]?.weightClassLabel || null,
      recordWins: 0,
      recordLosses: 0,
      recordDraws: 0,
      bio: form.notes || null,
      metadata: {
        selectedDisciplines: form.selectedDisciplines,
        experienceLevel: form.experienceLevel || null,
        categoryEntries: validEntries,
        phone: form.phone,
        address: {
          country: "India",
          state: form.state,
          district: form.district,
          line1: form.addressLine1,
          line2: form.addressLine2 || null,
          postalCode: form.postalCode,
        },
      },
    });
    if (profileRes.error) {
      setLoading(false);
      toast.error(profileRes.error.message || rt("Profile save failed", "प्रोफ़ाइल सेव विफल रही"));
      return;
    }

    const appRes = await api.createApplication({
      tournamentId: selectedTournamentId,
      formData: {
        selectedDisciplines: form.selectedDisciplines,
        experienceLevel: form.experienceLevel || null,
        categoryEntries: validEntries,
        notes: form.notes,
      },
    });
    if (appRes.error) {
      setLoading(false);
      toast.error(appRes.error.message || rt("Application draft failed", "आवेदन ड्राफ्ट विफल रहा"));
      return;
    }

    const applicationId = appRes.data.application.id;
    for (const [kind, file] of Object.entries(documents)) {
      const capturedVia = documentSources[kind] || "upload";
      const last4 = kind === "photo_id" && idNumberLast4 ? idNumberLast4.trim().toUpperCase() : undefined;
      const uploadRes = await api.uploadApplicationDocument(applicationId, { file, kind, label: file.name, capturedVia, idNumberLast4: last4 });
      if (uploadRes.error) {
        setLoading(false);
        toast.error(uploadRes.error.message || rt(`Failed to upload ${kind}`, `${kind} अपलोड नहीं हो सका`));
        return;
      }
    }

    const submitRes = await api.submitApplication(applicationId);
    setLoading(false);
    if (submitRes.error) {
      toast.error(submitRes.error.message || rt("Submission failed", "सबमिशन विफल रहा"));
      return;
    }
    toast.success(
      rt(
        `Application submitted with ${validEntries.length} selected discipline${validEntries.length === 1 ? "" : "s"}`,
        `${validEntries.length} चयनित डिसिप्लिन के साथ आवेदन सबमिट हो गया`
      )
    );
    router.push("/applicant");
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/primal-logo.png" alt="Primal" className="size-7 rounded-lg object-cover" />
            <span className="font-display font-semibold tracking-tight text-sm">Primal</span>
          </Link>
          <div className="flex items-center gap-2">
            <LocaleToggle compact />
            <ThemeToggle compact />
          </div>
        </div>
      </div>

      <div
        className="h-44 border-b border-border relative overflow-hidden"
        style={{ backgroundImage: `linear-gradient(to bottom, hsl(var(--background)/0.2), hsl(var(--background))), url(${HERO_IMAGE})`, backgroundSize: "cover", backgroundPosition: "center 30%" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-end pb-7">
          <div className="max-w-2xl">
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">
              {rt("Season 2026", "सीज़न 2026")} · {isClubTrack ? rt("Club onboarding", "क्लब ऑनबोर्डिंग") : rt("Self-registration", "स्व-पंजीकरण")}
            </div>
            <h1 className="font-display mt-1 text-3xl sm:text-4xl font-semibold tracking-tight">
              {isClubTrack ? rt("Create your club workspace.", "अपना क्लब वर्कस्पेस बनाएं।") : rt("Apply once and track review in real time.", "एक बार आवेदन करें और समीक्षा को रियल-टाइम में ट्रैक करें।")}
            </h1>
            <p className="text-sm text-secondary-muted mt-2">
              {isClubTrack
                ? rt("Register the club, establish the manager account, and unlock club-scoped participant workflows.", "क्लब पंजीकृत करें, मैनेजर अकाउंट बनाएं और क्लब-स्कोप्ड प्रतिभागी वर्कफ़्लो चालू करें।")
                : rt("Create an account, save your reusable profile, upload required documents, and submit directly into the review queue.", "अकाउंट बनाएं, पुन: उपयोग योग्य प्रोफ़ाइल सहेजें, आवश्यक दस्तावेज़ अपलोड करें और सीधे समीक्षा कतार में सबमिट करें।")}
            </p>
            {applicantRegistrationClosed ? (
              <div className="mt-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                {rt("New participant signup is closed until an admin opens a season registration window.", "जब तक एडमिन सीज़न रजिस्ट्रेशन विंडो नहीं खोलता, नया प्रतिभागी साइनअप बंद है।")}
              </div>
            ) : null}
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
                <div className={`text-[11px] font-medium ${step >= item.id ? "text-foreground" : "text-tertiary"}`}>
                  {item.key === "account"
                    ? rt("Account", "अकाउंट")
                    : item.key === "registration"
                      ? rt("Registration", "रजिस्ट्रेशन")
                      : item.key === "documents"
                        ? rt("Documents", "दस्तावेज़")
                        : rt("Review", "समीक्षा")}
                </div>
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
                  <h2 className="font-display text-2xl font-semibold tracking-tight">{isClubTrack ? rt("Manager account and club identity", "मैनेजर अकाउंट और क्लब पहचान") : rt("Account and participant profile", "अकाउंट और प्रतिभागी प्रोफ़ाइल")}</h2>
                </header>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label={isClubTrack ? rt("Manager full name", "मैनेजर का पूरा नाम") : rt("Full name", "पूरा नाम")} error={errors.fullName}><Input value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} className="h-11 bg-surface" /></Field>
                  <Field label={rt("Email", "ईमेल")} error={errors.email}><Input value={form.email} onChange={(e) => setField("email", e.target.value)} className="h-11 bg-surface" /></Field>
                  <Field label={rt("Password", "पासवर्ड")} error={errors.password}><Input type="password" value={form.password} onChange={(e) => setField("password", e.target.value)} className="h-11 bg-surface" /></Field>
                  <Field label={rt("Phone", "फ़ोन")}><Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} className="h-11 bg-surface" /></Field>
                  {isClubTrack ? (
                    <>
                      <Field label={rt("Club name", "क्लब का नाम")} error={errors.clubName}><Input value={form.clubName} onChange={(e) => setField("clubName", e.target.value)} className="h-11 bg-surface" /></Field>
                      <Field label={rt("Club slug", "क्लब स्लग")} error={errors.clubSlug}><Input value={form.clubSlug} onChange={(e) => setField("clubSlug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className="h-11 bg-surface" /></Field>
                      <Field label={rt("State", "राज्य")} error={errors.state}>
                        <Select value={form.state} onValueChange={setState} disabled={loadingStates || !stateOptions.length}>
                          <SelectTrigger className="h-11 bg-surface">
                            <SelectValue placeholder={loadingStates ? rt("Loading states...", "राज्य लोड हो रहे हैं...") : rt("Select state", "राज्य चुनें")} />
                          </SelectTrigger>
                          <SelectContent>
                            {stateOptions.map((stateName) => (
                              <SelectItem key={stateName} value={stateName}>{stateName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={rt("District", "जिला")} error={errors.district}>
                        <Select value={form.district} onValueChange={setDistrict} disabled={loadingDistricts || !districtOptions.length}>
                          <SelectTrigger className="h-11 bg-surface">
                            <SelectValue placeholder={loadingDistricts ? rt("Loading districts...", "जिले लोड हो रहे हैं...") : rt("Select district", "जिला चुनें")} />
                          </SelectTrigger>
                          <SelectContent>
                            {districtOptions.map((districtName) => (
                              <SelectItem key={districtName} value={districtName}>{districtName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={rt("Postal code", "पोस्टल कोड")} error={errors.postalCode}>
                        <Input
                          value={form.postalCode}
                          onChange={(e) => {
                            const postalCode = e.target.value.replace(/\D/g, "").slice(0, 6);
                            setField("postalCode", postalCode);
                            setPincodeResolution(null);
                            setPincodeHint(postalCode ? rt("Resolving PIN...", "PIN खोजा जा रहा है...") : "");
                          }}
                          className="h-11 bg-surface"
                          inputMode="numeric"
                          maxLength={6}
                        />
                        {pincodeHint ? (
                          <p className={`text-[11px] mt-1 ${pincodeResolution ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {pincodeLookupBusy ? rt("Validating PIN...", "PIN सत्यापित हो रहा है...") : pincodeHint}
                          </p>
                        ) : null}
                      </Field>
                      <Field label={rt("City (optional)", "शहर (वैकल्पिक)")}><Input value={form.clubCity} onChange={(e) => setField("clubCity", e.target.value)} className="h-11 bg-surface" /></Field>
                      <Field label={rt("Country", "देश")}><Input value={rt("India", "भारत")} disabled className="h-11 bg-surface" /></Field>
                    </>
                  ) : (
                    <>
                      <Field label={rt("Gender", "लिंग")} error={errors.gender}>
                        <div className="grid grid-cols-2 gap-2">
                          {GENDER_OPTIONS.map((option) => (
                            <button key={option.id} type="button" onClick={() => setField("gender", option.id)} className={`rounded-xl border px-4 py-3 text-sm font-medium ${form.gender === option.id ? "border-foreground bg-surface-muted text-foreground" : "border-border bg-background text-secondary-muted"}`}>{option.label}</button>
                          ))}
                        </div>
                      </Field>
                      <Field label={rt("Date of birth", "जन्म तिथि")} error={errors.dob}><Input type="date" value={form.dob} onChange={(e) => setField("dob", e.target.value)} className="h-11 bg-surface" /></Field>
                      <Field label={rt("Weight (kg)", "वजन (किग्रा)")} error={errors.weight}><Input type="number" step="0.1" value={form.weight} onChange={(e) => setField("weight", e.target.value)} className="h-11 bg-surface" /></Field>
                      <Field label={rt("Country", "देश")} error={errors.nationality}>
                        <Input value={rt("India", "भारत")} disabled className="h-11 bg-surface" />
                      </Field>
                      <Field label={rt("State", "राज्य")} error={errors.state}>
                        <Select value={form.state} onValueChange={setState} disabled={loadingStates || !stateOptions.length}>
                          <SelectTrigger className="h-11 bg-surface">
                            <SelectValue placeholder={loadingStates ? rt("Loading states...", "राज्य लोड हो रहे हैं...") : rt("Select state", "राज्य चुनें")} />
                          </SelectTrigger>
                          <SelectContent>
                            {stateOptions.map((stateName) => (
                              <SelectItem key={stateName} value={stateName}>{stateName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={rt("District", "जिला")} error={errors.district}>
                        <Select value={form.district} onValueChange={setDistrict} disabled={loadingDistricts || !districtOptions.length}>
                          <SelectTrigger className="h-11 bg-surface">
                            <SelectValue placeholder={loadingDistricts ? rt("Loading districts...", "जिले लोड हो रहे हैं...") : rt("Select district", "जिला चुनें")} />
                          </SelectTrigger>
                          <SelectContent>
                            {districtOptions.map((districtName) => (
                              <SelectItem key={districtName} value={districtName}>{districtName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4">
                        <Field label={rt("Address line 1", "पता पंक्ति 1")} error={errors.addressLine1}><Input value={form.addressLine1} onChange={(e) => setField("addressLine1", e.target.value)} className="h-11 bg-surface" /></Field>
                        <Field label={rt("Address line 2", "पता पंक्ति 2")}><Input value={form.addressLine2} onChange={(e) => setField("addressLine2", e.target.value)} className="h-11 bg-surface" /></Field>
                      </div>
                      <Field label={rt("Postal code", "पोस्टल कोड")} error={errors.postalCode}>
                        <Input
                          value={form.postalCode}
                          onChange={(e) => {
                            const postalCode = e.target.value.replace(/\D/g, "").slice(0, 6);
                            setField("postalCode", postalCode);
                            setPincodeResolution(null);
                            setPincodeHint(postalCode ? rt("Resolving PIN...", "PIN खोजा जा रहा है...") : "");
                          }}
                          className="h-11 bg-surface"
                          inputMode="numeric"
                          maxLength={6}
                        />
                        {pincodeHint ? (
                          <p className={`text-[11px] mt-1 ${pincodeResolution ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {pincodeLookupBusy ? rt("Validating PIN...", "PIN सत्यापित हो रहा है...") : pincodeHint}
                          </p>
                        ) : null}
                      </Field>
                    </>
                  )}
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-5">
                <header>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">{isClubTrack ? rt("Club readiness", "क्लब तैयारी") : rt("Application details", "आवेदन विवरण")}</h2>
                  <p className="text-sm text-secondary-muted mt-1">
                    {isClubTrack ? rt("This sets up the club workspace and manager account.", "यह क्लब वर्कस्पेस और मैनेजर अकाउंट सेट करता है।") : rt("Selected disciplines are stored in the application payload for reviewer context.", "चुनी गई डिसिप्लिन समीक्षा संदर्भ के लिए आवेदन payload में सहेजी जाती हैं।")}
                  </p>
                </header>
                {isClubTrack ? (
                  <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-secondary-muted">
                    {rt("Club onboarding will create the authenticated club account and the club entity in one submission.", "क्लब ऑनबोर्डिंग एक ही सबमिशन में प्रमाणित क्लब अकाउंट और क्लब एंटिटी बनाएगा।")}
                  </div>
                ) : (
                  <>
                    <Field label={rt("Experience level", "अनुभव स्तर")} error={errors.experienceLevel}>
                      <div className="grid grid-cols-3 gap-2">
                        {EXPERIENCE_LEVELS.map((level) => (
                          <button key={level.id} type="button" onClick={() => setField("experienceLevel", level.id)} className={`rounded-xl border px-3 py-3 text-sm font-medium ${form.experienceLevel === level.id ? "border-foreground bg-surface-muted text-foreground" : "border-border bg-background text-secondary-muted"}`}>{level.label}</button>
                        ))}
                      </div>
                    </Field>
                    <Field label={rt("Tournament", "टूर्नामेंट")} error={errors.tournament}>
                      <Select value={tournamentId} onValueChange={setTournamentId} disabled={tournamentsLoading || openTournaments.length === 0}>
                        <SelectTrigger className="h-11 bg-surface">
                          <SelectValue placeholder={tournamentsLoading ? rt("Loading tournaments...", "टूर्नामेंट लोड हो रहे हैं...") : rt("Select open tournament", "खुला टूर्नामेंट चुनें")} />
                        </SelectTrigger>
                        <SelectContent>
                          {openTournaments.map((tournament) => (
                            <SelectItem key={tournament.id} value={tournament.id}>{tournament.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    {!tournamentsLoading && openTournaments.length === 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">{rt("No season is currently open. Existing participants can sign in later and apply once registration opens.", "अभी कोई सीज़न खुला नहीं है। मौजूदा प्रतिभागी बाद में साइन इन करके रजिस्ट्रेशन खुलने पर आवेदन कर सकते हैं।")}</p>
                    )}
                    <div className="grid md:grid-cols-2 gap-3">
                      {DISCIPLINE_DEFINITIONS.map((discipline) => {
                        const active = form.selectedDisciplines.includes(discipline.id);
                        const preview = entryPreview.find((entry) => entry.disciplineId === discipline.id);
                        return (
                          <button key={discipline.id} type="button" onClick={() => toggleDiscipline(discipline.id)} className={`rounded-2xl border p-4 text-left ${active ? "border-foreground bg-surface-muted" : "border-border bg-background hover:bg-surface-muted/40"}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-display text-lg font-semibold tracking-tight">{discipline.label}</div>
                                <div className="text-xs text-tertiary mt-1">{rt("Minimum age", "न्यूनतम आयु")} {discipline.minAge}</div>
                              </div>
                              <div className={`size-6 rounded-full border flex items-center justify-center ${active ? "border-foreground bg-foreground text-background" : "border-border text-transparent"}`}>
                                <Check className="size-3.5" />
                              </div>
                            </div>
                            {active && preview && (
                              <div className="mt-4 text-sm text-secondary-muted">
                                <div>{preview.categoryLabel}</div>
                                {!preview.valid && preview.issues?.length ? (
                                  <ul className="mt-2 list-disc pl-4 text-xs text-amber-600 dark:text-amber-400">
                                    {preview.issues.map((issue, index) => (
                                      <li key={index}>{issue}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {errors.selectedDisciplines && <p className="text-[11px] text-red-500">{errors.selectedDisciplines}</p>}
                    {errors.tournament && <p className="text-[11px] text-red-500">{errors.tournament}</p>}
                    <Field label={rt("Notes for reviewer", "रिव्यूअर के लिए नोट्स")}>
                      <Textarea rows={4} value={form.notes} onChange={(e) => setField("notes", e.target.value)} className="bg-surface" />
                    </Field>
                  </>
                )}
              </section>
            )}

            {step === 3 && (
              <section className="space-y-5">
                <header>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">{isClubTrack ? rt("Review onboarding details", "ऑनबोर्डिंग विवरण की समीक्षा") : rt("Required documents", "आवश्यक दस्तावेज़")}</h2>
                  <p className="text-sm text-secondary-muted mt-1">
                    {isClubTrack ? rt("Review the club setup before creating the workspace.", "वर्कस्पेस बनाने से पहले क्लब सेटअप की समीक्षा करें।") : rt("These uploads are required for submission and enforced by the backend.", "ये अपलोड सबमिशन के लिए आवश्यक हैं और बैकएंड द्वारा लागू किए जाते हैं।")}
                  </p>
                </header>
                {isClubTrack ? (
                  <div className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-secondary-muted">
                    {rt("Club onboarding does not require document uploads in this phase.", "इस चरण में क्लब ऑनबोर्डिंग के लिए दस्तावेज़ अपलोड आवश्यक नहीं हैं।")}
                  </div>
                ) : (
                  <div className="grid lg:grid-cols-3 gap-4">
                    {[
                      ["medical", rt("Medical certificate", "मेडिकल सर्टिफिकेट"), rt("Front page with stamp & signature.", "स्टैम्प और हस्ताक्षर वाला पहला पेज।")],
                      ["photo_id", rt("Photo ID", "फोटो ID"), rt("Aadhaar / PAN / passport / voter ID. Government-issued.", "आधार / PAN / पासपोर्ट / वोटर ID। सरकारी दस्तावेज़।")],
                      ["consent", rt("Signed consent", "हस्ताक्षरित सहमति"), rt("Signed waiver. All pages.", "हस्ताक्षरित waiver। सभी पेज।")],
                    ].map(([key, label, hint]) => (
                      <Field key={key} label={label} error={errors[key]}>
                        <DocumentInputField
                          label={label}
                          scanHint={hint}
                          value={documents[key]}
                          capturedVia={documentSources[key]}
                          onChange={(file) => setDocuments((current) => ({ ...current, [key]: file }))}
                          onCapturedViaChange={(tag) => setDocumentSources((current) => ({ ...current, [key]: tag }))}
                        />
                        {key === "photo_id" ? (
                          <div className="mt-3 rounded-xl border border-border bg-surface px-3 py-2">
                            <label className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">
                              {rt("Last 4 digits of ID number (optional)", "ID नंबर के अंतिम 4 अंक (वैकल्पिक)")}
                            </label>
                            <input
                              inputMode="text"
                              maxLength={4}
                              value={idNumberLast4}
                              onChange={(event) => setIdNumberLast4(event.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 4))}
                              placeholder="1234"
                              className="mt-1 block w-28 rounded-md border border-border bg-background px-2 py-1 text-sm tracking-[0.3em]"
                            />
                            <p className="mt-1 text-[11px] text-secondary-muted">
                              {rt("Helps reviewers cross-check Aadhaar/PAN without storing the full number.", "समीक्षकों को पूरा नंबर संग्रहीत किए बिना आधार/PAN जांचने में मदद करता है।")}
                            </p>
                          </div>
                        ) : null}
                      </Field>
                    ))}
                  </div>
                )}
              </section>
            )}

            {step === 4 && (
              <section className="space-y-5">
                <header>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">{rt("Review and submit", "समीक्षा करें और सबमिट करें")}</h2>
                </header>
                <div className="rounded-2xl border border-border bg-surface-muted/40 divide-y divide-border">
                  {[
                    [rt("Name", "नाम"), form.fullName || "-"],
                    [rt("Email", "ईमेल"), form.email || "-"],
                    [rt("Track", "ट्रैक"), isClubTrack ? rt("Club onboarding", "क्लब ऑनबोर्डिंग") : rt("Individual application", "व्यक्तिगत आवेदन")],
                    [rt("Club", "क्लब"), isClubTrack ? form.clubName || "-" : rt("Self-registration", "स्व-पंजीकरण")],
                    [rt("Nationality", "राष्ट्रीयता"), isClubTrack ? "-" : form.nationality || "-"],
                    [rt("State / District", "राज्य / जिला"), `${form.state || "-"} / ${form.district || "-"}`],
                    [rt("Disciplines", "डिसिप्लिन"), isClubTrack ? "-" : (form.selectedDisciplines.map((disciplineId) => DISCIPLINE_DEFINITIONS.find((discipline) => discipline.id === disciplineId)?.label).join(", ") || "-")],
                    [rt("Documents", "दस्तावेज़"), isClubTrack ? rt("Not required", "आवश्यक नहीं") : `${Object.values(documents).filter(Boolean).length}/3 ${rt("uploaded", "अपलोड")}`],
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
                <ArrowLeft className="size-4 mr-1" /> {rt("Back", "वापस")}
              </Button>
              {step < STEPS.length ? (
                <Button type="button" onClick={next} className="bg-foreground text-background hover:bg-foreground/90" disabled={applicantRegistrationClosed}>
                  {rt("Continue", "जारी रखें")} <ArrowRight className="size-4 ml-1" />
                </Button>
              ) : (
                <Button type="button" onClick={submit} disabled={loading || applicantRegistrationClosed} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                  {loading ? rt("Submitting...", "सबमिट हो रहा है...") : rt("Submit", "सबमिट करें")}
                </Button>
              )}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="rounded-3xl border border-border bg-surface elev-card p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{isClubTrack ? rt("Workspace", "वर्कस्पेस") : rt("Application preview", "आवेदन पूर्वावलोकन")}</div>
              <div className="font-display text-3xl font-semibold tracking-tight mt-2">{isClubTrack ? "Club" : validEntries.length}</div>
              <p className="text-sm text-secondary-muted mt-1">
                {isClubTrack ? rt("Creates the manager account plus club entity.", "मैनेजर अकाउंट और क्लब एंटिटी बनाता है।") : rt("Selected disciplines are captured in the submitted application payload.", "चुनी गई डिसिप्लिन सबमिटेड आवेदन payload में कैप्चर होती हैं।")}
              </p>
            </div>
            {!isClubTrack && (
              <div className="rounded-3xl border border-border bg-surface elev-card p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">{rt("Discipline preview", "डिसिप्लिन पूर्वावलोकन")}</div>
                <div className="mt-4 space-y-3">
                  {entryPreview.map((entry) => (
                    <div key={entry.disciplineId} className="rounded-2xl border border-border bg-background/60 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{entry.disciplineLabel}</span>
                        <span className={`text-[11px] font-semibold uppercase tracking-wider ${entry.valid ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400"}`}>
                          {entry.valid ? rt("Ready", "तैयार") : rt("Review", "समीक्षा")}
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
