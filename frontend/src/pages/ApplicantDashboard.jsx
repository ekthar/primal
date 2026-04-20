import { useEffect, useState } from "react";
import { Download, FileCheck2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import StatusPill from "@/components/shared/StatusPill";
import EmptyState from "@/components/shared/EmptyState";
import api from "@/lib/api";

export default function ApplicantDashboard() {
  const [profile, setProfile] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getMyProfile(), api.listApplications()]).then(([profileRes, appRes]) => {
      if (!profileRes.error) setProfile(profileRes.data.profile);
      if (!appRes.error) setApplications(appRes.data.items || []);
      setLoading(false);
    });
  }, []);

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
              <a href={api.exportApplicationPdf(applications[0].id)} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="h-9">
                  <Download className="size-3.5" /> Application PDF
                </Button>
              </a>
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
          <span className="text-secondary-muted">draft → submitted → under review → correction loop → approved or rejected</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.45fr_0.85fr] gap-5 mt-6">
        <div className="rounded-3xl border border-border bg-surface elev-card p-6">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Tournament submissions</h2>
            <p className="text-sm text-secondary-muted mt-1">Every submission is API-backed and exportable.</p>
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
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-surface elev-card p-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">Profile summary</h2>
            <Separator className="my-4" />
            <dl className="space-y-3 text-sm">
              <Detail label="Nationality" value={profile.nationality || "-"} />
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
