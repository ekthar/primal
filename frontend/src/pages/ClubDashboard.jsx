import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, AlertTriangle, FileEdit, Plus, Search, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import api from "@/lib/api";
import { toast } from "sonner";

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
  const [participantForm, setParticipantForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    gender: "",
    dateOfBirth: "",
    discipline: "",
    weightKg: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    state: "",
    district: "",
    tournamentId: "",
  });

  const clubId = clubs[0]?.id || "";

  useEffect(() => {
    Promise.all([api.listClubs(), api.listApplications(), api.publicTournaments()]).then(([clubsRes, appRes, tRes]) => {
      if (!clubsRes.error) setClubs(clubsRes.data.clubs || []);
      if (!appRes.error) setApplications(appRes.data.items || []);
      if (!tRes.error) setTournaments(tRes.data.tournaments || []);
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
  const counts = useMemo(() => ({
    draft: applications.filter((item) => item.status === "draft").length,
    submitted: applications.filter((item) => item.status === "submitted").length,
    needs_correction: correctionItems.length,
    approved: applications.filter((item) => item.status === "approved").length,
  }), [applications, correctionItems.length]);

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
        formData: { createdByClub: true },
      });
      if (draftRes.error) {
        toast.error(draftRes.error.message || "Participant created but draft application failed");
      }
    }

    await Promise.all([reloadParticipants(), reloadApplications()]);
    setCreatingParticipant(false);

    const resetUrl = participantRes.data?.participant?.resetUrl;
    if (resetUrl) {
      toast.success("Participant created. Reset link issued for account setup.");
    } else {
      toast.success("Participant created under your club");
    }

    setParticipantForm({
      fullName: "",
      email: "",
      phone: "",
      gender: "",
      dateOfBirth: "",
      discipline: "",
      weightKg: "",
      addressLine1: "",
      addressLine2: "",
      postalCode: "",
      state: "",
      district: "",
      tournamentId: participantForm.tournamentId,
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

  return (
    <div className="px-6 py-6 md:py-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">Club dashboard</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">{clubs[0]?.name || "Club workspace"}</h1>
          <p className="text-sm text-secondary-muted mt-1">{clubs[0]?.city || "-"} · {applications.length} club-scoped applications</p>
        </div>
        <Link href="/register?track=club">
          <Button className="bg-foreground text-background hover:bg-foreground/90">
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
          <Field label="Gender"><Input value={participantForm.gender} onChange={(e) => setParticipantField("gender", e.target.value)} className="h-10 bg-background" placeholder="male / female / other" /></Field>
          <Field label="Discipline"><Input value={participantForm.discipline} onChange={(e) => setParticipantField("discipline", e.target.value)} className="h-10 bg-background" /></Field>
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
      </section>

      <Tabs defaultValue="inbox" className="mt-8">
        <TabsList className="bg-surface-muted p-1 rounded-xl h-auto">
          <TabsTrigger value="inbox" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2">
            Correction inbox
          </TabsTrigger>
          <TabsTrigger value="roster" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2">
            Applications
          </TabsTrigger>
          <TabsTrigger value="participants" className="data-[state=active]:bg-surface data-[state=active]:shadow-soft rounded-lg px-4 py-2">
            Participants
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="participants" className="mt-5">
          {loadingParticipants ? (
            <div className="text-sm text-secondary-muted">Loading participants...</div>
          ) : participants.length === 0 ? (
            <EmptyState icon={Plus} title="No participants yet" description="Use the onboarding form to add participants under this club." />
          ) : (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-tertiary font-semibold border-b border-border">
                    <th className="px-5 py-3">Participant</th>
                    <th className="px-5 py-3 hidden md:table-cell">Email</th>
                    <th className="px-5 py-3 hidden sm:table-cell">Location</th>
                    <th className="px-5 py-3">Discipline</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant) => {
                    const address = participant.metadata?.address || {};
                    return (
                      <tr key={participant.id} className="border-b border-border hover:bg-surface-muted/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="text-sm font-medium">{participant.first_name} {participant.last_name}</div>
                          <div className="text-[11px] text-tertiary font-mono">{participant.id}</div>
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell text-sm">{participant.email || "-"}</td>
                        <td className="px-5 py-3 hidden sm:table-cell text-sm">{address.state || "-"} / {address.district || "-"}</td>
                        <td className="px-5 py-3 text-sm">{participant.discipline || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
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
