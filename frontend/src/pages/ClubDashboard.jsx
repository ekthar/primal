import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, AlertTriangle, FileEdit, Plus, Search, Send, Download, Printer, Pencil, Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import { SectionLoader } from "@/components/shared/PrimalLoader";
import { ResponsivePageShell, ResponsiveTable } from "@/components/shared/ResponsivePrimitives";
import { DISCIPLINE_DEFINITIONS, GENDER_OPTIONS } from "@/lib/tournamentWorkflow";
import api from "@/lib/api";
import { toast } from "sonner";

const DISCIPLINE_OPTIONS = DISCIPLINE_DEFINITIONS.map((discipline) => ({
  id: discipline.id,
  label: discipline.label,
}));

export default function ClubDashboard() {
  const [clubs, setClubs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [creatingParticipant, setCreatingParticipant] = useState(false);
  const [pincodeLookupBusy, setPincodeLookupBusy] = useState(false);
  const [pincodeHint, setPincodeHint] = useState("");
  const [pincodeResolved, setPincodeResolved] = useState(null);
  const [query, setQuery] = useState("");
  const [activeApplication, setActiveApplication] = useState(null);
  const [appealReasonById, setAppealReasonById] = useState({});
  const [cancelReasonById, setCancelReasonById] = useState({});
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [createdCredentialsByProfile, setCreatedCredentialsByProfile] = useState({});
  const [generatedResetByProfile, setGeneratedResetByProfile] = useState({});
  const [activeApplicationFormText, setActiveApplicationFormText] = useState("");
  const [savingActiveApplication, setSavingActiveApplication] = useState(false);
  const [participantForm, setParticipantForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    gender: "",
    dateOfBirth: "",
    discipline: "",
    selectedDisciplines: [],
    weightKg: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    state: "",
    district: "",
    tournamentId: "",
    docs: { medical: null, photo_id: null, consent: null },
  });

  const clubId = clubs[0]?.id || "";

  useEffect(() => {
    Promise.all([api.listClubs(), api.listApplications(), api.publicTournaments()]).then(([clubsRes, appRes, tRes]) => {
      if (!clubsRes.error) setClubs(clubsRes.data.clubs || []);
      if (!appRes.error) setApplications(appRes.data.items || []);
      if (!tRes.error) {
        const available = tRes.data.tournaments || [];
        setTournaments(available);
        if (available.length > 0) {
          setParticipantForm((current) => ({ ...current, tournamentId: current.tournamentId || available[0].id }));
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!clubId) {
      setParticipants([]);
      return;
    }
    setLoadingParticipants(true);
    api.listClubParticipants(clubId).then((res) => {
      if (!res.error) setParticipants(res.data.participants || []);
      setLoadingParticipants(false);
    });
  }, [clubId]);

  useEffect(() => {
    const pin = String(participantForm.postalCode || "").replace(/\D/g, "");
    if (!pin) {
      setPincodeResolved(null);
      setPincodeHint("");
      setPincodeLookupBusy(false);
      return;
    }
    if (!/^[1-9][0-9]{5}$/.test(pin)) {
      setPincodeResolved(null);
      setPincodeHint("Enter a valid 6-digit India PIN");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setPincodeLookupBusy(true);
      const { data, error } = await api.publicIndiaPincodeLookup(pin);
      if (cancelled) return;
      setPincodeLookupBusy(false);

      if (error || !data?.location) {
        setPincodeResolved(null);
        setPincodeHint(error?.message || "PIN not found");
        return;
      }

      const location = data.location;
      setPincodeResolved(location);
      setParticipantForm((current) => ({
        ...current,
        postalCode: location.pincode,
        state: location.state,
        district: location.district,
      }));
      setPincodeHint(`${location.state}, ${location.district}`);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [participantForm.postalCode]);

  const correctionItems = useMemo(() => applications.filter((application) => application.status === "needs_correction"), [applications]);
  const filtered = useMemo(() => {
    if (!query) return applications;
    const needle = query.toLowerCase();
    return applications.filter((application) => `${application.first_name} ${application.last_name}`.toLowerCase().includes(needle));
  }, [applications, query]);
  const tournamentById = useMemo(() => Object.fromEntries(tournaments.map((tournament) => [tournament.id, tournament])), [tournaments]);

  const isRegistrationLive = (tournamentId) => {
    const tournament = tournamentById[tournamentId];
    if (!tournament) return false;
    const now = Date.now();
    const opensAt = tournament.registration_open_at ? new Date(tournament.registration_open_at).getTime() : null;
    const closesAt = tournament.registration_close_at ? new Date(tournament.registration_close_at).getTime() : null;
    if (!opensAt || !closesAt) return true;
    return now >= opensAt && now <= closesAt;
  };

  const isCorrectionWindowLive = (application) => {
    if (application.status !== "needs_correction") return false;
    if (!application.correction_due_at) return true;
    return Date.now() <= new Date(application.correction_due_at).getTime();
  };

  const canEditApplication = (application) => {
    if (application.status === "draft") return isRegistrationLive(application.tournament_id);
    if (application.status === "needs_correction") return isCorrectionWindowLive(application);
    return false;
  };
  const counts = useMemo(() => ({
    draft: applications.filter((item) => item.status === "draft").length,
    submitted: applications.filter((item) => item.status === "submitted").length,
    needs_correction: correctionItems.length,
    approved: applications.filter((item) => item.status === "approved").length,
  }), [applications, correctionItems.length]);
  const applicationsByProfile = useMemo(() => {
    const map = {};
    for (const item of applications) {
      if (!item.profile_id) continue;
      if (!map[item.profile_id]) map[item.profile_id] = [];
      map[item.profile_id].push(item);
    }
    return map;
  }, [applications]);

  const setParticipantField = (key, value) => {
    setParticipantForm((current) => ({ ...current, [key]: value }));
  };

  const reloadParticipants = async () => {
    if (!clubId) return;
    const res = await api.listClubParticipants(clubId);
    if (!res.error) setParticipants(res.data.participants || []);
  };

  const reloadApplications = async () => {
    const refreshed = await api.listApplications();
    if (!refreshed.error) setApplications(refreshed.data.items || []);
  };

  const toggleDiscipline = (disciplineId) => {
    setParticipantForm((current) => {
      const has = current.selectedDisciplines.includes(disciplineId);
      const selectedDisciplines = has
        ? current.selectedDisciplines.filter((item) => item !== disciplineId)
        : [...current.selectedDisciplines, disciplineId];
      return {
        ...current,
        selectedDisciplines,
        discipline: selectedDisciplines[0] || "",
      };
    });
  };

  const createParticipant = async () => {
    if (!clubId) {
      toast.error("No active club selected");
      return;
    }
    if (!participantForm.fullName.trim() || !participantForm.email.trim()) {
      toast.error("Full name and email are required");
      return;
    }
    if (!participantForm.addressLine1.trim()) {
      toast.error("Address line 1 is required");
      return;
    }
    if (!participantForm.gender) {
      toast.error("Please select fighter gender");
      return;
    }
    if (participantForm.selectedDisciplines.length === 0) {
      toast.error("Select at least one discipline");
      return;
    }
    if (!pincodeResolved) {
      toast.error("Valid PIN lookup is required");
      return;
    }

    setCreatingParticipant(true);
    const participantRes = await api.createClubParticipant(clubId, {
      email: participantForm.email.trim().toLowerCase(),
      fullName: participantForm.fullName.trim(),
      phone: participantForm.phone.trim() || null,
      gender: participantForm.gender || null,
      dateOfBirth: participantForm.dateOfBirth || null,
      discipline: participantForm.discipline || null,
      selectedDisciplines: participantForm.selectedDisciplines,
      weightKg: participantForm.weightKg ? Number(participantForm.weightKg) : null,
      address: {
        country: "India",
        state: participantForm.state,
        district: participantForm.district,
        line1: participantForm.addressLine1,
        line2: participantForm.addressLine2 || null,
        postalCode: participantForm.postalCode,
      },
      sendResetLink: true,
    });

    if (participantRes.error) {
      setCreatingParticipant(false);
      toast.error(participantRes.error.message || "Unable to create participant");
      return;
    }

    const profileId = participantRes.data?.participant?.profile?.id;
    if (participantForm.tournamentId && profileId) {
      const draftRes = await api.createApplication({
        tournamentId: participantForm.tournamentId,
        profileId,
        formData: {
          createdByClub: true,
          selectedDisciplines: participantForm.selectedDisciplines,
        },
      });
      if (draftRes.error) {
        toast.error(draftRes.error.message || "Participant created but draft application failed");
      } else {
        const applicationId = draftRes.data?.application?.id;
        const hasAllRequiredDocs = ["medical", "photo_id", "consent"].every((kind) => participantForm.docs?.[kind]);
        if (applicationId) {
          for (const [kind, file] of Object.entries(participantForm.docs || {})) {
            if (!file) continue;
            const uploadRes = await api.uploadApplicationDocument(applicationId, {
              file,
              kind,
              label: file.name,
            });
            if (uploadRes.error) {
              toast.error(uploadRes.error.message || `Failed to upload ${kind}`);
            }
          }

          if (hasAllRequiredDocs) {
            const submitRes = await api.submitApplication(applicationId);
            if (submitRes.error) {
              toast.error(submitRes.error.message || "Draft created but submit failed");
            } else {
              toast.success("Application submitted and moved to admin review queue");
            }
          } else {
            toast.message("Draft created. Upload all required docs to submit for admin approval.");
          }
        }
      }
    } else {
      toast.message("Participant profile created. Select a tournament to create and submit an application for approval.");
    }

    await Promise.all([reloadParticipants(), reloadApplications()]);
    setCreatingParticipant(false);

    const participantPayload = participantRes.data?.participant || {};
    const resetUrl = participantPayload.resetUrl;
    setCreatedCredentials({
      loginId: participantPayload.loginId || participantForm.email,
      temporaryPassword: participantPayload.temporaryPassword || null,
      fighterCode: participantPayload.fighterCode || null,
      resetUrl: resetUrl || null,
    });
    if (profileId) {
      setCreatedCredentialsByProfile((current) => ({
        ...current,
        [profileId]: {
          loginId: participantPayload.loginId || participantForm.email,
          temporaryPassword: participantPayload.temporaryPassword || null,
          fighterCode: participantPayload.fighterCode || null,
          resetUrl: resetUrl || null,
        },
      }));
    }
    toast.success("Participant created under your club");

    setParticipantForm({
      fullName: "",
      email: "",
      phone: "",
      gender: "",
      dateOfBirth: "",
      discipline: "",
      selectedDisciplines: [],
      weightKg: "",
      addressLine1: "",
      addressLine2: "",
      postalCode: "",
      state: "",
      district: "",
      tournamentId: participantForm.tournamentId,
      docs: { medical: null, photo_id: null, consent: null },
    });
    setPincodeResolved(null);
    setPincodeHint("");
  };

  const resubmit = async (id) => {
    const { error } = await api.resubmitApplication(id);
    if (error) {
      toast.error(error.message || "Resubmit failed");
      return;
    }
    await reloadApplications();
  };

  const submitDraft = async (id) => {
    const { error } = await api.submitApplication(id);
    if (error) {
      toast.error(error.message || "Submit failed");
      return;
    }
    toast.success("Application submitted");
    await reloadApplications();
  };

  const fileAppeal = async (applicationId) => {
    const reason = (appealReasonById[applicationId] || "").trim();
    if (reason.length < 10) {
      toast.error("Appeal reason must be at least 10 characters");
      return;
    }
    const { error } = await api.fileAppeal({ applicationId, reason });
    if (error) {
      toast.error(error.message || "Appeal request failed");
      return;
    }
    toast.success("Appeal filed");
    setAppealReasonById((current) => ({ ...current, [applicationId]: "" }));
  };

  const requestCancel = async (applicationId) => {
    const reason = (cancelReasonById[applicationId] || "").trim();
    if (reason.length < 10) {
      toast.error("Cancellation reason must be at least 10 characters");
      return;
    }
    const { error } = await api.requestApplicationCancel(applicationId, { reason });
    if (error) {
      toast.error(error.message || "Cancel request failed");
      return;
    }
    toast.success("Cancellation request sent");
    setCancelReasonById((current) => ({ ...current, [applicationId]: "" }));
    await reloadApplications();
  };

  const openApplication = async (applicationId) => {
    const { data, error } = await api.getApplication(applicationId);
    if (error) {
      toast.error(error.message || "Unable to load form");
      return;
    }
    setActiveApplication(data.application);
    setActiveApplicationFormText(JSON.stringify(data.application?.form_data || {}, null, 2));
  };

  const saveApplicationEdits = async () => {
    if (!activeApplication) return;
    let parsed;
    try {
      parsed = JSON.parse(activeApplicationFormText || "{}");
    } catch {
      toast.error("Application form JSON is invalid");
      return;
    }
    setSavingActiveApplication(true);
    const { error } = await api.updateApplication(activeApplication.id, { formData: parsed });
    setSavingActiveApplication(false);
    if (error) {
      toast.error(error.message || "Unable to save application edits");
      return;
    }
    toast.success("Application form updated");
    await reloadApplications();
    await openApplication(activeApplication.id);
  };

  const printParticipants = () => {
    if (!participants.length) {
      toast.error("No participants to print");
      return;
    }
    const rows = participants.map((participant, index) => {
      const address = participant.metadata?.address || {};
      return `<tr><td>${index + 1}</td><td>${participant.first_name || ""} ${participant.last_name || ""}</td><td>${participant.email || "-"}</td><td>${participant.discipline || "-"}</td><td>${address.state || "-"}/${address.district || "-"}</td></tr>`;
    }).join("");
    const printable = window.open("", "_blank", "width=900,height=700");
    if (!printable) {
      toast.error("Popup blocked. Allow popups to print the list.");
      return;
    }
    printable.document.write(`
      <html>
      <head><title>Club Participants</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; }
        h1 { margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
      </style>
      </head>
      <body>
        <h1>${clubs[0]?.name || "Club"} Participants</h1>
        <div>Total: ${participants.length}</div>
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Discipline</th><th>State/District</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
  };

  const issueResetLink = async (profileId) => {
    if (!clubId || !profileId) return;
    const { data, error } = await api.createClubParticipantResetLink(clubId, profileId);
    if (error) {
      toast.error(error.message || "Unable to generate reset link");
      return;
    }
    const participant = data?.participant;
    setGeneratedResetByProfile((current) => ({
      ...current,
      [profileId]: participant?.resetUrl || null,
    }));
    setCreatedCredentialsByProfile((current) => ({
      ...current,
      [profileId]: {
        ...(current[profileId] || {}),
        loginId: participant?.loginId || current[profileId]?.loginId || "",
        fighterCode: participant?.fighterCode || current[profileId]?.fighterCode || "",
        resetUrl: participant?.resetUrl || null,
      },
    }));
    toast.success("Reset link generated");
  };

  return (
    <ResponsivePageShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Club dashboard</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">{clubs[0]?.name || "Club workspace"}</h1>
          <p className="text-sm text-secondary-muted mt-1">{clubs[0]?.city || "-"} · {applications.length} club-scoped applications</p>
        </div>
        <Link href="/register?track=club" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto bg-foreground text-background hover:bg-foreground/90">
            <Plus className="size-4 mr-1" /> Update club setup
          </Button>
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Drafts" value={counts.draft} icon={FileEdit} />
        <StatCard label="Submitted" value={counts.submitted} icon={Send} />
        <StatCard label="Needs correction" value={counts.needs_correction} icon={AlertTriangle} highlight />
        <StatCard label="Approved" value={counts.approved} icon={Inbox} />
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-surface p-5 elev-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Participant onboarding</div>
            <h2 className="font-display text-2xl font-semibold tracking-tight mt-1">Add participant under your club</h2>
          </div>
          <div className="text-xs text-tertiary">Country locked: India</div>
        </div>

        <div className="mt-5 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Full name"><Input value={participantForm.fullName} onChange={(e) => setParticipantField("fullName", e.target.value)} className="h-10 bg-background" /></Field>
          <Field label="Email"><Input type="email" value={participantForm.email} onChange={(e) => setParticipantField("email", e.target.value)} className="h-10 bg-background" /></Field>
          <Field label="Phone"><Input value={participantForm.phone} onChange={(e) => setParticipantField("phone", e.target.value)} className="h-10 bg-background" /></Field>
          <Field label="Date of birth"><Input type="date" value={participantForm.dateOfBirth} onChange={(e) => setParticipantField("dateOfBirth", e.target.value)} className="h-10 bg-background" /></Field>
          <Field label="Gender">
            <div className="grid grid-cols-2 gap-2">
              {GENDER_OPTIONS.map((option) => {
                const active = participantForm.gender === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setParticipantField("gender", option.id)}
                    className={`rounded-lg border px-3 py-2 text-sm ${active ? "border-foreground bg-surface text-foreground" : "border-border bg-background text-secondary-muted"}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Primary discipline"><Input value={participantForm.discipline} disabled className="h-10 bg-background" placeholder="Auto from selected list" /></Field>
          <Field label="Weight (kg)"><Input type="number" step="0.1" value={participantForm.weightKg} onChange={(e) => setParticipantField("weightKg", e.target.value)} className="h-10 bg-background" /></Field>
          <Field label="Address line 1"><Input value={participantForm.addressLine1} onChange={(e) => setParticipantField("addressLine1", e.target.value)} className="h-10 bg-background" /></Field>
          <Field label="Address line 2"><Input value={participantForm.addressLine2} onChange={(e) => setParticipantField("addressLine2", e.target.value)} className="h-10 bg-background" /></Field>
          <Field label="PIN code">
            <Input
              value={participantForm.postalCode}
              onChange={(e) => setParticipantField("postalCode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-10 bg-background"
              inputMode="numeric"
              maxLength={6}
            />
          </Field>
          <Field label="State"><Input value={participantForm.state} disabled className="h-10 bg-background" /></Field>
          <Field label="District"><Input value={participantForm.district} disabled className="h-10 bg-background" /></Field>
          <Field label="Create draft for tournament (optional)">
            <Select value={participantForm.tournamentId} onValueChange={(value) => setParticipantField("tournamentId", value)}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue placeholder="Skip for now" />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map((tournament) => (
                  <SelectItem key={tournament.id} value={tournament.id}>{tournament.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Medical certificate (optional)">
            <Input type="file" className="h-10 bg-background" onChange={(e) => setParticipantField("docs", { ...participantForm.docs, medical: e.target.files?.[0] || null })} />
          </Field>
          <Field label="Photo ID (optional)">
            <Input type="file" className="h-10 bg-background" onChange={(e) => setParticipantField("docs", { ...participantForm.docs, photo_id: e.target.files?.[0] || null })} />
          </Field>
          <Field label="Consent form (optional)">
            <Input type="file" className="h-10 bg-background" onChange={(e) => setParticipantField("docs", { ...participantForm.docs, consent: e.target.files?.[0] || null })} />
          </Field>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-background p-3">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Disciplines (multi-select)</div>
          <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {DISCIPLINE_OPTIONS.map((discipline) => {
              const active = participantForm.selectedDisciplines.includes(discipline.id);
              return (
                <button
                  key={discipline.id}
                  type="button"
                  onClick={() => toggleDiscipline(discipline.id)}
                  className={`rounded-lg border px-3 py-2 text-sm text-left ${active ? "border-foreground bg-surface text-foreground" : "border-border bg-background text-secondary-muted"}`}
                >
                  {discipline.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-tertiary">Selected: {participantForm.selectedDisciplines.length}</p>
        </div>

        {pincodeHint ? (
          <p className={`mt-3 text-xs ${pincodeResolved ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {pincodeLookupBusy ? "Validating PIN..." : pincodeHint}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button onClick={createParticipant} disabled={creatingParticipant || !clubId} className="bg-foreground text-background hover:bg-foreground/90">
            <Plus className="size-4 mr-1" /> {creatingParticipant ? "Adding..." : "Add participant"}
          </Button>
        </div>

        {createdCredentials ? (
          <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
            <div className="text-sm font-semibold">Fighter account created</div>
            <div className="mt-1 text-xs">Login ID: {createdCredentials.loginId || "-"}</div>
            <div className="mt-1 text-xs">Temporary password: {createdCredentials.temporaryPassword || "Already existing account"}</div>
            <div className="mt-1 text-xs">Fighter unique ID: {createdCredentials.fighterCode || "-"}</div>
            {createdCredentials.resetUrl ? <div className="mt-1 text-xs break-all">Reset link: {createdCredentials.resetUrl}</div> : null}
          </div>
        ) : null}
      </section>

      <Tabs defaultValue="inbox" className="mt-8">
        <TabsList className="bg-surface-muted p-1 rounded-xl h-auto flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="inbox" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2">
            Correction inbox
          </TabsTrigger>
          <TabsTrigger value="roster" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2">
            Applications
          </TabsTrigger>
          <TabsTrigger value="participants" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2">
            Participants
          </TabsTrigger>
          <TabsTrigger value="accounts" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2">
            Fighter Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-5">
          {correctionItems.length === 0 ? (
            <EmptyState icon={Inbox} title="Inbox zero." description="No correction requests are open for this club." />
          ) : (
            <div className="space-y-3">
              {correctionItems.map((application) => (
                <article key={application.id} className="rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-surface p-5 elev-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-display text-lg font-semibold tracking-tight">{application.first_name} {application.last_name}</h3>
                        <StatusPill status={application.status} />
                      </div>
                      <div className="text-xs text-tertiary mt-1 font-mono">{application.id} · {application.tournament_name}</div>
                      <div className="mt-3 text-sm text-orange-900 dark:text-orange-100">
                        Correction due {application.correction_due_at ? new Date(application.correction_due_at).toLocaleString() : "soon"}.
                      </div>
                    </div>
                    <Button onClick={() => resubmit(application.id)} className="bg-foreground text-background hover:bg-foreground/90">
                      Resubmit
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roster" className="mt-5">
          <div className="relative max-w-sm mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tertiary" />
            <Input placeholder="Search applications..." value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9 h-9 bg-surface" />
          </div>
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                  <th className="px-5 py-3">Applicant</th>
                  <th className="px-5 py-3 hidden md:table-cell">Tournament</th>
                  <th className="px-5 py-3 hidden sm:table-cell">Discipline</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((application) => (
                  <tr key={application.id} className="border-b border-border hover:bg-surface-muted/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium">{application.first_name} {application.last_name}</div>
                      <div className="text-[11px] text-tertiary font-mono">{application.id}</div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell text-sm">{application.tournament_name}</td>
                    <td className="px-5 py-3 hidden sm:table-cell text-sm">{application.discipline || "-"}</td>
                    <td className="px-5 py-3"><StatusPill status={application.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" className="h-8" onClick={() => openApplication(application.id)}>
                          <Pencil className="size-3.5 mr-1" /> {canEditApplication(application) ? "View / Edit" : "View"}
                        </Button>
                        <Button variant="ghost" className="h-8" onClick={() => api.downloadApplicationPdf(application.id)}>
                          <Download className="size-3.5 mr-1" /> PDF
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeApplication ? (
            <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-lg font-semibold tracking-tight">{activeApplication.first_name} {activeApplication.last_name}</div>
                  <div className="text-xs text-tertiary font-mono">{activeApplication.id}</div>
                  <div className="text-xs text-tertiary mt-1">
                    {canEditApplication(activeApplication)
                      ? "Editing window is live"
                      : activeApplication.status === "draft"
                        ? "View only: registration is closed for this tournament"
                        : "View only: correction window is closed"}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setActiveApplication(null)}>Close</Button>
              </div>
              {canEditApplication(activeApplication) ? (
                <textarea
                  value={activeApplicationFormText}
                  onChange={(e) => setActiveApplicationFormText(e.target.value)}
                  className="mt-3 w-full min-h-[220px] text-xs font-mono overflow-auto rounded-lg border border-border bg-background p-3"
                />
              ) : (
                <pre className="mt-3 w-full min-h-[220px] text-xs font-mono overflow-auto rounded-lg border border-border bg-background p-3">{activeApplicationFormText}</pre>
              )}

              {canEditApplication(activeApplication) ? (
                <div className="mt-2 flex justify-end">
                  <Button onClick={saveApplicationEdits} disabled={savingActiveApplication} className="bg-foreground text-background hover:bg-foreground/90">
                    <Save className="size-4 mr-1" /> {savingActiveApplication ? "Saving..." : "Save edits"}
                  </Button>
                </div>
              ) : null}

              <div className="mt-4 grid md:grid-cols-2 gap-3">
                {activeApplication.status === "draft" && isRegistrationLive(activeApplication.tournament_id) ? (
                  <Button onClick={() => submitDraft(activeApplication.id)} className="bg-foreground text-background hover:bg-foreground/90">Submit application</Button>
                ) : null}

                {activeApplication.status === "rejected" || isCorrectionWindowLive(activeApplication) ? (
                  <div className="rounded-xl border border-border bg-background p-3">
                    <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Appeal reason</Label>
                    <Input className="mt-2 h-9 bg-surface" value={appealReasonById[activeApplication.id] || ""} onChange={(e) => setAppealReasonById((current) => ({ ...current, [activeApplication.id]: e.target.value }))} />
                    <Button className="mt-2" onClick={() => fileAppeal(activeApplication.id)}>File appeal</Button>
                  </div>
                ) : null}

                {canEditApplication(activeApplication) && activeApplication.status !== "approved" && activeApplication.status !== "rejected" ? (
                  <div className="rounded-xl border border-border bg-background p-3">
                    <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">Cancellation reason</Label>
                    <Input className="mt-2 h-9 bg-surface" value={cancelReasonById[activeApplication.id] || ""} onChange={(e) => setCancelReasonById((current) => ({ ...current, [activeApplication.id]: e.target.value }))} />
                    <Button variant="outline" className="mt-2" onClick={() => requestCancel(activeApplication.id)}>Request cancel</Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="participants" className="mt-5">
          <div className="mb-3 flex justify-end">
            <Button variant="outline" onClick={printParticipants}>
              <Printer className="size-4 mr-1" /> Print participants list
            </Button>
          </div>
          {loadingParticipants ? (
            <SectionLoader
              title="Loading participants"
              description="Pulling your club roster, registrations, and application links."
              cards={2}
              rows={4}
              compact
            />
          ) : participants.length === 0 ? (
            <EmptyState icon={Plus} title="No participants yet" description="Use the onboarding form to add participants under this club." />
          ) : (
            <ResponsiveTable>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                    <th className="px-5 py-3">Participant</th>
                    <th className="px-5 py-3 hidden md:table-cell">Email</th>
                    <th className="px-5 py-3 hidden sm:table-cell">Location</th>
                    <th className="px-5 py-3">Discipline</th>
                    <th className="px-5 py-3 text-right">Application</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant) => {
                    const address = participant.metadata?.address || {};
                    const selectedDisciplines = participant.metadata?.selectedDisciplines || [];
                    const participantApps = applicationsByProfile[participant.id] || [];
                    const latestApp = participantApps[0];
                    return (
                      <tr key={participant.id} className="border-b border-border hover:bg-surface-muted/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="text-sm font-medium">{participant.first_name} {participant.last_name}</div>
                          <div className="text-[11px] text-tertiary font-mono">{participant.id}</div>
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell text-sm">{participant.email || "-"}</td>
                        <td className="px-5 py-3 hidden sm:table-cell text-sm">{address.state || "-"} / {address.district || "-"}</td>
                        <td className="px-5 py-3 text-sm">{selectedDisciplines.length ? selectedDisciplines.join(", ") : (participant.discipline || "-")}</td>
                        <td className="px-5 py-3 text-right">
                          {latestApp ? (
                            <Button variant="ghost" className="h-8" onClick={() => api.downloadApplicationPdf(latestApp.id)}>
                              <Printer className="size-3.5 mr-1" /> Print form
                            </Button>
                          ) : (
                            <span className="text-xs text-tertiary">No application</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </TabsContent>

        <TabsContent value="accounts" className="mt-5">
          {participants.length === 0 ? (
            <EmptyState icon={Inbox} title="No fighter accounts yet" description="Create participants first to manage login credentials." />
          ) : (
            <ResponsiveTable>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                    <th className="px-5 py-3">Fighter</th>
                    <th className="px-5 py-3">Login ID</th>
                    <th className="px-5 py-3">Fighter ID</th>
                    <th className="px-5 py-3">Temporary Password</th>
                    <th className="px-5 py-3">Reset Link</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant) => {
                    const creds = createdCredentialsByProfile[participant.id] || {};
                    const generatedReset = generatedResetByProfile[participant.id] || creds.resetUrl;
                    const loginId = creds.loginId || participant.email || "-";
                    const fighterId = creds.fighterCode || participant.metadata?.fighterCode || "-";
                    return (
                      <tr key={participant.id} className="border-b border-border hover:bg-surface-muted/50 transition-colors align-top">
                        <td className="px-5 py-3">
                          <div className="text-sm font-medium">{participant.first_name} {participant.last_name}</div>
                          <div className="text-[11px] text-tertiary font-mono">{participant.id}</div>
                        </td>
                        <td className="px-5 py-3 text-sm">{loginId}</td>
                        <td className="px-5 py-3 text-sm font-mono">{fighterId}</td>
                        <td className="px-5 py-3 text-sm font-mono">{creds.temporaryPassword || "Use reset link"}</td>
                        <td className="px-5 py-3 text-xs max-w-[280px] break-all">{generatedReset || "Not generated yet"}</td>
                        <td className="px-5 py-3 text-right">
                          <Button variant="outline" size="sm" onClick={() => issueResetLink(participant.id)}>
                            Generate Reset Link
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </TabsContent>
      </Tabs>
    </ResponsivePageShell>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wider font-semibold text-secondary-muted">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, highlight }) {
  return (
    <div className={`rounded-2xl border p-5 bg-surface ${highlight ? "border-orange-200 dark:border-orange-900/50" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-tertiary font-semibold">{label}</span>
        <Icon className="size-4 text-tertiary" strokeWidth={1.75} />
      </div>
      <div className="mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}
