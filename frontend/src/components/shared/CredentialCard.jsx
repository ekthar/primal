import { QrCode, ShieldCheck, UserCircle2 } from "lucide-react";
import StatusPill from "@/components/shared/StatusPill";

/**
 * CredentialCard — the in-app mirror of the Application PDF cover page.
 *
 * Same visual language as the printed credential (ink-red accent rule,
 * brand micro-label, display name, 4-block identity grid, status badge,
 * issuing-authority block, verify URL + signature fingerprint). The goal
 * is visual parity between the screen view and the printed document so
 * reviewers never have to mentally translate between the two.
 *
 * All tokens come from the Primal OS palette (tailwind `primal.*` + the
 * `--primal-*` CSS vars) that Phase 0 seeded. No ad-hoc colors.
 */
export default function CredentialCard({
  applicationDisplayId,
  applicantName,
  clubName,
  category,
  status = "submitted",
  identityBlocks = [],
  issuingAuthority = "Primal Federation Registry",
  verifyUrl,
  signatureShortId,
  portraitUrl = null,
  compact = false,
}) {
  return (
    <section
      aria-label="Participant credential"
      className="relative overflow-hidden rounded-3xl border border-border bg-[color:var(--primal-paper,#FAFAF7)] text-[color:var(--primal-ink,#0A0A0A)] shadow-sm"
    >
      {/* Ink-red accent rule — mirrors the 3pt bleed on the PDF cover */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-[color:var(--primal-accent,#7A1E22)]"
      />

      <div className={`grid ${compact ? "grid-cols-1 gap-4 p-5" : "grid-cols-[auto_1fr_auto] gap-6 p-6"} items-start`}>
        {/* Portrait slot with corner L-brackets, matching the PDF hero block */}
        <figure
          aria-hidden={!portraitUrl}
          className={`relative ${compact ? "size-24" : "size-32"} shrink-0 overflow-hidden rounded-2xl border border-border bg-[color:var(--primal-surface,#F4F1EA)]`}
        >
          {portraitUrl ? (
            <img
              src={portraitUrl}
              alt={applicantName ? `Portrait of ${applicantName}` : "Participant portrait"}
              className="size-full object-cover"
            />
          ) : (
            <UserCircle2 className="absolute inset-0 m-auto size-10 text-[color:var(--primal-text-muted,#6B6B6B)]" aria-hidden />
          )}
          {/* L-brackets */}
          <span aria-hidden className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-[color:var(--primal-ink,#0A0A0A)]" />
          <span aria-hidden className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-[color:var(--primal-ink,#0A0A0A)]" />
          <span aria-hidden className="absolute left-0 bottom-0 h-4 w-4 border-l-2 border-b-2 border-[color:var(--primal-ink,#0A0A0A)]" />
          <span aria-hidden className="absolute right-0 bottom-0 h-4 w-4 border-r-2 border-b-2 border-[color:var(--primal-ink,#0A0A0A)]" />
        </figure>

        {/* Identity column */}
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--primal-text-muted,#6B6B6B)]">
            Primal · Participant Credential
          </div>
          <h2 className="font-display mt-1 text-[28px] leading-[1.05] font-semibold tracking-tight">
            {applicantName || "Applicant"}
          </h2>
          <div className="mt-1 text-sm text-[color:var(--primal-accent,#7A1E22)] font-medium">
            {[clubName || "Individual applicant", category].filter(Boolean).join(" · ")}
          </div>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <StatusPill status={status} />
            {applicationDisplayId && (
              <span className="font-mono text-[11px] text-[color:var(--primal-text-muted,#6B6B6B)]">
                ID {applicationDisplayId}
              </span>
            )}
          </div>

          {/* 4-block identity grid — same order as the PDF cover */}
          {!!identityBlocks.length && (
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {identityBlocks.map((block) => (
                <div key={block.label} className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--primal-text-muted,#6B6B6B)]">
                    {block.label}
                  </dt>
                  <dd className="mt-0.5 truncate text-[color:var(--primal-ink,#0A0A0A)]">
                    {block.value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Verify column (issuing authority + QR + signature) */}
        {!compact && (
          <div className="w-44 shrink-0 border-l border-border pl-5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--primal-verify,#0F7B5C)]">
              <ShieldCheck className="size-3" aria-hidden /> Issued by
            </div>
            <div className="mt-1 text-xs font-medium leading-snug">{issuingAuthority}</div>
            <div className="mt-4 flex items-start gap-2">
              <QrCode className="size-16 text-[color:var(--primal-ink,#0A0A0A)]" aria-hidden />
              <div className="text-[10px] leading-[1.35] text-[color:var(--primal-text-muted,#6B6B6B)]">
                <div className="font-semibold uppercase tracking-[0.16em]">Verify</div>
                {verifyUrl && (
                  <a
                    href={verifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block break-all font-mono text-[9px] text-[color:var(--primal-ink,#0A0A0A)] underline decoration-dotted underline-offset-2"
                  >
                    {verifyUrl.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>
            {signatureShortId && (
              <div className="mt-4 border-t border-border pt-3 text-[9px] uppercase tracking-[0.16em] text-[color:var(--primal-text-muted,#6B6B6B)]">
                Signature
                <div className="mt-0.5 font-mono text-[10px] text-[color:var(--primal-ink,#0A0A0A)] normal-case tracking-normal">
                  {signatureShortId}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
