import { useEffect, useState } from "react";
import { Download, Eye, FileCheck2, Gavel, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import api from "@/lib/api";
import { toast } from "sonner";

function getAccessMessage(application) {
  if (!application) return "";
  if (application.status === "draft") {
    return "Drafts remain visible here, but editing and submission depend on the tournament registration window.";
  }
  if (application.status === "needs_correction") {
    if (application.correction_due_at) {
      return `Correction access stays open until ${new Date(application.correction_due_at).toLocaleString()}.`;
    }
    return "Correction access stays tied to the correction window set by admin.";
  }
  return "Submitted applications remain viewable after registration closes, even when they are no longer editable.";
}

export default function ApplicantDashboard() {
  const [profile, setProfile] = useState(null);
  const [applications, setApplications] = useState([]);
  const [appealsByApplication, setAppealsByApplication] = useState({});
  const [appealDrafts, setAppealDrafts] = useState({});
  const [filingAppealId, setFilingAppealId] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [activeApplication, setActiveApplication] = useState(null);
  const [activeApplicationDetails, setActiveApplicationDetails] = useState(null);
  const [loadingApplicationId, setLoadingApplicationId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getMyProfile(), api.listApplications(), api.myAppeals()]).then(([profileRes, appRes, appealRes]) => {
      if (!profileRes.error) setProfile(profileRes.data.profile);
      if (!appRes.error) setApplications(appRes.data.items || []);
      if (!appealRes.error) {
        const index = {};
        for (const appeal of appealRes.data.appeals || []) {
          if (!index[appeal.application_id]) index[appeal.application_id] = appeal;
        }
        setAppealsByApplication(index);
      }
      setLoading(false);
    });
  }, []);

  async function submitAppeal(applicationId) {
    const reason = (appealDrafts[applicationId] || "").trim();
    if (reason.length < 10) {
      toast.error("Appeal reason must be at least 10 characters");
      return;
    }
    setFilingAppealId(applicationId);
    const { data, error } = await api.fileAppeal({ applicationId, reason });
    setFilingAppealId(null);
    if (error) {
      toast.error(error.message || "Failed to file appeal");
      return;
    }
    const appeal = data?.appeal;
    if (appeal) {
      setAppealsByApplication((current) => ({ ...current, [applicationId]: appeal }));
    }
    setAppealDrafts((current) => ({ ...current, [applicationId]: "" }));
    toast.success("Appeal filed successfully");
  }

  async function downloadApplicationPdf(applicationId) {
    if (!applicationId) return;
    setDownloadingPdf(true);
    const { error } = await api.downloadApplicationPdf(applicationId);
    setDownloadingPdf(false);
    if (error) {
      toast.error(error.message || "Failed to download application PDF");
      return;
    }
    toast.success("Application PDF download started");
  }

  async function openApplication(application) {
    setLoadingApplicationId(application.id);
    const { data, error } = await api.getApplication(application.id);
    setLoadingApplicationId(null);
    if (error) {
      toast.error(error.message || "Failed to load application details");
      return;
    }
    setActiveApplication(application);
    setActiveApplicationDetails(data?.application || null);
  }

  if (loading) return <div className="max-w-6xl mx-auto px-6 py-8 text-sm text-secondary-muted">Loading application workspace...</div>;
  if (!profile) {
    return (
      <div className="p-10">
        <EmptyState icon={FileCheck2} title="No applicant profile found" description="Complete registration to create your reusable profile and tournament application." />
      </div>
    );
  }

  const approvedCount = applications.filter((application) => application.status === "approved").length;
  const pendingCount = applications.filter((application) => ["submitted", "under_review", "needs_correction"].includes(application.status)).length;
  const address = profile.metadata?.address || null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="rounded-3xl border border-border bg-surface elev-card overflow-hidden">
        <div className="bg-gradient-to-br from-surface-muted to-surface p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-tertiary font-semibold">My application</div>
              <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">{profile.first_name} {profile.last_name}</h1>
              <p className="text-sm text-secondary-muted mt-2 max-w-2xl">
                Your reusable profile is saved once and reused across tournaments. Each submission enters the review queue with full status history.
              </p>
            </div>
            {applications[0] && (
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={downloadingPdf}
                onClick={() => downloadApplicationPdf(applications[0].id)}
              >
                <Download className="size-3.5" /> {downloadingPdf ? "Preparing PDF..." : "Application PDF"}
              </Button>
            )}
          </div>

          <div className="mt-8 grid sm:grid-cols-3 gap-3">
            <Metric label="Applications" value={applications.length} helper="Tournament submissions" />
            <Metric label="Approved" value={approvedCount} helper="Cleared by the review team" />
            <Metric label="Pending review" value={pendingCount} helper="Still moving through workflow" />
          </div>
        </div>
        <div className="border-t border-border px-6 sm:px-8 py-5 bg-surface-muted/30 flex items-center gap-2 text-sm">
          <FileCheck2 className="size-4 text-primary" />
          <span className="font-medium">Workflow:</span>
          <span className="text-secondary-muted">draft to submitted to under review to correction loop to approved or rejected</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.45fr_0.85fr] gap-5 mt-6">
        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-surface elev-card p-6">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">Tournament submissions</h2>
              <p className="text-sm text-secondary-muted mt-1">Every submission remains viewable from your dashboard, even after registration closes.</p>
            </div>
            <div className="mt-5 space-y-4">
              {applications.map((application) => (
                <article key={application.id} className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-display text-xl font-semibold tracking-tight">{application.tournament_name}</div>
                      <div className="text-sm text-secondary-muted mt-1">
                        {application.discipline || "Profile discipline pending"} · {application.weight_class || "Weight class pending"}
                      </div>
                    </div>
                    <StatusPill status={application.status} />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
                    <Detail label="Updated" value={new Date(application.updated_at).toLocaleDateString()} />
                    <Detail label="Reviewer" value={application.reviewer_id || "Unassigned"} />
                    <Detail label="Correction due" value={application.correction_due_at ? new Date(application.correction_due_at).toLocaleDateString() : "-"} />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button variant="outline" onClick={() => openApplication(application)} disabled={loadingApplicationId === application.id}>
                      <Eye className="size-3.5" /> {loadingApplicationId === application.id ? "Opening..." : "View application"}
                    </Button>
                  </div>

                  {(["rejected", "needs_correction"].includes(application.status)) && (
                    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Gavel className="size-4 text-primary" /> Appeal panel
                      </div>
                      {appealsByApplication[application.id] ? (
                        <div className="mt-2 text-sm text-secondary-muted">
                          Appeal status: <span className="capitalize">{appealsByApplication[application.id].status?.replace("_", " ")}</span>
                        </div>
                      ) : (
                        <>
                          <p className="mt-2 text-sm text-secondary-muted">
                            If you disagree with the review outcome, submit an appeal for admin decision.
                          </p>
                          <Textarea
                            className="mt-3 bg-background"
                            rows={3}
                            placeholder="Explain why this decision should be reconsidered"
                            value={appealDrafts[application.id] || ""}
                            onChange={(event) => setAppealDrafts((current) => ({ ...current, [application.id]: event.target.value }))}
                          />
                          <div className="mt-3">
                            <Button
                              variant="outline"
                              onClick={() => submitAppeal(application.id)}
                              disabled={filingAppealId === application.id}
                            >
                              {filingAppealId === application.id ? "Submitting..." : "File appeal"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>

          {activeApplicationDetails && activeApplication ? (
            <div className="rounded-3xl border border-border bg-surface elev-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight">Application details</h2>
                  <p className="text-sm text-secondary-muted mt-1">{activeApplication.tournament_name}</p>
                </div>
                <Button variant="ghost" onClick={() => { setActiveApplication(null); setActiveApplicationDetails(null); }}>Close</Button>
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 text-sm text-secondary-muted">
                {getAccessMessage(activeApplication)}
              </div>

              <div className="mt-5 grid sm:grid-cols-2 gap-3 text-sm">
                <Detail label="Status" value={activeApplicationDetails.status?.replace(/_/g, " ") || "-"} />
                <Detail label="Tournament" value={activeApplicationDetails.tournament_name || "-"} />
                <Detail label="Club" value={activeApplicationDetails.club_name || "Individual"} />
                <Detail label="Weight class" value={activeApplicationDetails.weight_class || "-"} />
              </div>

              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">Submitted form data</div>
                <pre className="mt-2 w-full min-h-[220px] text-xs font-mono overflow-auto rounded-lg border border-border bg-background p-3">
                  {JSON.stringify(activeApplicationDetails.form_data || {}, null, 2)}
                </pre>
              </div>

              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">Status timeline</div>
                <div className="mt-2 space-y-2">
                  {(activeApplicationDetails.statusEvents || []).map((event) => (
                    <div key={event.id} className="rounded-xl border border-border bg-background/60 px-3 py-3 text-sm">
                      <div className="font-medium">{event.to_status?.replace(/_/g, " ") || "-"}</div>
                      <div className="text-secondary-muted mt-1">{event.reason || "No reason captured"}</div>
                    </div>
                  ))}
                  {!(activeApplicationDetails.statusEvents || []).length && (
                    <div className="text-sm text-secondary-muted">No timeline events available.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-surface elev-card p-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">Profile summary</h2>
            <Separator className="my-4" />
            <dl className="space-y-3 text-sm">
              <Detail label="Nationality" value={profile.nationality || "-"} />
              <Detail label="State" value={address?.state || "-"} />
              <Detail label="District" value={address?.district || "-"} />
              <Detail label="Postal code" value={address?.postalCode || "-"} />
              <Detail label="Discipline" value={profile.discipline || "-"} />
              <Detail label="Weight" value={profile.weight_kg ? `${profile.weight_kg} kg` : "-"} />
              <Detail label="Weight class" value={profile.weight_class || "-"} />
            </dl>
          </div>

          <div className="rounded-3xl border border-border bg-surface elev-card p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert className="size-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">Appeals and correction loop</h3>
                <p className="text-sm text-secondary-muted mt-2">
                  If a reviewer requests changes, edit is allowed only inside the correction window. Rejections can be appealed and reopened by admin.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</div>
      <div className="font-display text-3xl font-semibold tracking-tight mt-2">{value}</div>
      <div className="text-xs text-secondary-muted mt-1">{helper}</div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[10px] uppercase tracking-wider text-tertiary font-semibold">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
