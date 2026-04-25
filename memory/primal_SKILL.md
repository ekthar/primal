# SKILL · Primal

> **Who this is for.** A long-lived, project-wide context file for any AI or engineer (Devin, Codex, Claude, Cursor, human) picking up work on `ekthar/primal` **cold**. Read top-to-bottom before the first change. Everything under `## Hard rules` is non-negotiable.

---

## 0. Repo shape in one screen

```
primal/
├─ frontend/                           Next.js 14 Pages Router (React 18, Tailwind + shadcn/ui)
│  ├─ pages/                           Thin route entrypoints (admin/*.js, applicant.js, club.js, ...)
│  ├─ src/
│  │  ├─ pages/*.jsx                   Real page components mounted by /pages
│  │  ├─ components/layout/            AppShell (topbar, sidebar, mobile nav), ResponsivePageShell
│  │  ├─ components/shared/            PrimalLoader, CommandPalette, CredentialCard, BackButton…
│  │  ├─ components/tournament/        Bracket tree, BracketSlot, StatusPill, DivisionCard…
│  │  ├─ components/ui/                shadcn/ui primitives — do NOT hand-edit; re-generate if needed
│  │  ├─ lib/api.js                    Single frontend HTTP client + helpers
│  │  ├─ lib/tournamentWorkflow.js     Client-side workflow constants (statuses, transitions)
│  │  ├─ context/                      AuthProvider + ThemeProvider
│  │  └─ index.css                     Tailwind layer + Primal OS CSS variables
│  └─ tailwind.config.js               Primal tokens: primal.paper / ink / accent / verify / gold
│
├─ backend-node/                       Node 20, Express 4, PostgreSQL (pg), vitest
│  ├─ server.js                        Bootstrap, helmet, cors, routes
│  ├─ src/
│  │  ├─ routes/*.routes.js            REST endpoints by domain
│  │  ├─ services/*.service.js         Business logic
│  │  │  ├─ pdfTokens.js               Palette, TYPE_SCALE, STATUS_SPEC, contrastRatio, filename, ribbon
│  │  │  ├─ pdfComposition.js          Drawing primitives (lockedText, drawStatusBadge, drawBracketTree…)
│  │  │  ├─ export.service.js          All XLSX + PDF + ZIP generators (~2k LOC)
│  │  │  ├─ report.service.js          Aggregation queries (approvedParticipantReport…)
│  │  │  ├─ application.service.js     Status machine, reapply, correction loop
│  │  │  ├─ tournament.service.js      Registration windows, season rollover
│  │  │  ├─ review.service.js          Reviewer assignment, decisions
│  │  │  ├─ documentStorage.service.js Vercel Blob upload with retries
│  │  │  └─ notifications.js           Resend + Twilio orchestration (resendKey / twilioSid)
│  │  ├─ repositories.js               All SQL lives here — DO NOT write SQL inside services
│  │  ├─ migrations/NNN_*.sql          Plain SQL, applied in order by `npm run migrate`
│  │  ├─ statusMachine.js              Allowed application-status transitions (source of truth)
│  │  ├─ security.js                   JWT, bcrypt, signAccess/signRefresh
│  │  ├─ audit.js                      Append-only audit log with hash chain
│  │  ├─ config.js                     Reads env → typed config object (ALWAYS go through this)
│  │  └─ middleware.js                 requireAuth, requireRole, ah (async handler)
│  └─ tests/*.test.js                  vitest — 64 tests across 7 files after Phase 6
│
├─ PRIMAL_ACCESSIBILITY.md             WCAG 2.2 AA baseline (Phase 6 deliverable)
├─ design_guidelines.json              Primal OS tokens exported for non-code tooling
└─ README.md                           Quickstart — `npm run migrate && npm run seed && npm run dev`
```

---

## 1. Hard rules (read before the first commit)

1. **SQL lives in `backend-node/src/repositories.js`.** Services call named repo methods; they never `query('SELECT …')` themselves.
2. **Status transitions go through `src/statusMachine.js`.** Direct UPDATE of `applications.status` is a bug. The machine owns the allowed edges and emits `status_events` rows.
3. **PDF composition helpers never mutate `doc.y` and never call `doc.addPage()`.** They draw at `(x, y)` and return. The caller owns pagination. Break this and tests in `pdf-composition.test.js` fail.
4. **PDF colors always come from `palette.*` (tokens).** No literal hex inside export or composition code. Palette lives in `backend-node/src/services/pdfTokens.js`.
5. **PDF text always uses `TYPE_SCALE.display | h1 | h2 | label | body | micro`.** Six sizes, no seventh. Adding a size requires a plan update + token update.
6. **Status meaning must survive black-and-white print.** Every status in `STATUS_SPEC` pairs a tone, an icon shape, and a textual label. Color alone is never load-bearing.
7. **Never push directly to `main`.** Every change is a PR. `git checkout -b devin/$(date +%s)-feature-name` is the branch pattern used by this repo's automation.
8. **Never modify migrations after they've merged.** Add a new `00N_*.sql`. The migration runner applies files in lexicographic order.
9. **Never commit secrets.** All credentials load from `config.js` → `process.env`. Local dev uses `.env`; production uses Render / Vercel env.
10. **Frontend pages are in `pages/`, but component code lives in `src/pages/*.jsx`.** The `pages/*.js` files are 3-line mount shells — adding logic there is wrong.

---

## 2. Quickstart (fresh machine)

```bash
# Clone + install
git clone https://github.com/ekthar/primal.git
cd primal

# Backend
cd backend-node
cp .env.example .env                                 # fill in DATABASE_URL at minimum
npm install
npm run migrate                                       # idempotent; safe to re-run
npm run seed                                          # demo users below
npm run dev                                           # :4000

# Frontend (new terminal)
cd ../frontend
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:4000" > .env.local
npm install
npm run dev                                           # :3000
```

**Seeded sign-ins (password `demo1234`):**

| role      | email                           |
|-----------|---------------------------------|
| admin     | `mei@primalfight.io`            |
| reviewer  | `luca@primalfight.io`           |
| club      | `(see seed.js output)`          |
| applicant | `(see seed.js output)`          |

**Seed with volume (for load-test / bracket smoke):** `npm run seed:loadtest` in `backend-node/`.

---

## 3. Test + lint commands (memorize these)

```bash
# Backend — must pass before every PR
cd backend-node
npm test                 # vitest run; 64 tests as of Phase 6
npm run lint             # eslint src server.js
npm run smoke:export     # generates all 5 PDFs + XLSX locally

# Frontend — must build cleanly before every PR
cd frontend
npx next build           # full prod build; catches all JSX + import errors
npm run lint             # (may not be configured; fallthrough)
```

**CI on GitHub runs Vercel preview + GitGuardian + Vercel Comments only** — no backend test runner in CI. You are responsible for running `npm test` locally before pushing.

---

## 4. The Primal OS design system (the invariant)

A single visual system spans PDFs, in-app screens, QR verify pages, and credential cards. Maintained across Phases 0–7 of the redesign (all merged to `main`). The tokens:

| token                         | value                 | purpose                                        |
|-------------------------------|-----------------------|------------------------------------------------|
| `palette.paper`               | `#FAFAF7`             | Light surface — PDF page, card background      |
| `palette.surface`             | `#F3F0E8`             | Alt surface — zebra stripes, muted panels      |
| `palette.ink`                 | `#0A0A0A`             | Primary text, hairlines, icon default          |
| `palette.accent`              | `#7A1E22`             | Ink-red — federation authority; rejected       |
| `palette.verify`              | `#0F7B5C`             | Seal green — approved / verification           |
| `palette.gold`                | `#C8A96A`             | Championship accent — champion bracket card    |
| `palette.textMuted`           | `#4B4B4B`             | Secondary text                                 |

CSS equivalents live in `frontend/src/index.css` under `--primal-*` vars and `frontend/tailwind.config.js` under `primal.*`. **Any new frontend surface must use these, not shadcn defaults.**

### Type scale (6 sizes, frozen)

| name      | px | use                                 |
|-----------|----|-------------------------------------|
| `display` | 28 | PDF cover name, big hero            |
| `h1`      | 20 | Section headers, credential name    |
| `h2`      | 14 | Subsection, page titles             |
| `body`    | 10 | Paragraph, table cells              |
| `label`   | 8  | ALL-CAPS micro-label, uppercase key |
| `micro`   | 7  | Fingerprint, legal footer           |

### Status system (grayscale-safe)

Every `application_status` value has a row in `STATUS_SPEC`: `{ tone, iconShape, label }`. `drawStatusBadge()` composes a capsule pill; `drawStatusGlyph()` owns the vector shapes. Printing in B&W keeps every status distinguishable by shape + text, never color-only. Adding a new status = update `STATUS_SPEC` *and* `statusMachine.js`.

### Filename contract

`buildExportFilename({ kind, tournament, applicationId, date })` produces `primal_<tournament-slug>_<kind>_<YYYY-MM-DD>.pdf`. Never construct filenames manually.

### Accessibility

`PRIMAL_ACCESSIBILITY.md` at repo root documents the WCAG 2.2 AA baseline. Key primitives in `frontend/src/index.css`:

- `.skip-to-main` — first tab-stop link, hidden until focused
- `:focus-visible` 2px ring on every interactive element
- `@media (prefers-reduced-motion: reduce)` global reset

Backend: `auditPaletteContrast(palette)` in `pdfTokens.js` + 3 vitest cases guard the palette from regressing below AA.

---

## 5. Domain vocabulary (read this before reading code)

| term                    | meaning                                                                 |
|-------------------------|-------------------------------------------------------------------------|
| **Tournament / Season** | `tournaments` row. `is_public` + `registration_open_at/close_at` drive eligibility. "Season" and "Tournament" are used interchangeably in the UI; both refer to a single `tournaments.id`. |
| **Current season**      | Any `tournaments` row with `is_public = true` AND `NOW()` between `registration_open_at` and `registration_close_at`. Use `tournamentService.getRegistrationState()` or `.listPublic()` — do not reimplement. |
| **Application**         | One `(profile_id, tournament_id)` pair. Statuses: `draft → submitted → under_review → approved | rejected | needs_correction → back to submitted | season_closed`. |
| **Season rollover**     | When a new public tournament opens for registration, `closePriorSeasonApplications()` transitions every still-open application from prior tournaments to `season_closed`. Data is never deleted. |
| **Reapply**             | `application.service.js#reapply()` — clones an old application's form data into a fresh draft on the new tournament. Used by the "Reapply from last season" button. |
| **Profile**             | One row per `user`. Holds `weight_kg`, `weight_class`, DOB, gender, discipline. Survives tournaments. |
| **Weigh-in**            | Admin → Weigh-in updates — `AdminSettings.jsx` tab `weighin`. Updates `profiles.weight_kg` and recalculates `profiles.weight_class`. Club-filterable. |
| **Division**            | Bucket (`discipline × age × weight_class × experience`). Used by bracket builder. Persisted in `divisions` + `division_brackets`. |
| **Bracket**             | Single-elimination match graph. Frontend renders an interactive tree; PDF renders the classical centered-tree version (`drawBracketTree` in `pdfComposition.js`). |
| **Review queue**        | `AdminQueue.jsx` → `review.service.js`. Least-loaded reviewer algorithm; `review_due_at` SLA. |
| **Correction loop**     | Reviewer marks `correction_fields` + `correction_reason` → status → `needs_correction`. Applicant gets a notification and a `correction_due_at` deadline. |
| **Appeal**              | Separate table + service. Triggered from rejected applications. |
| **Circular**            | Public notice / rulebook attached to a tournament. `circular.service.js`. |
| **Audit log**           | Append-only `audit_log` table with `prev_hash` + `this_hash` hash chain. Every meaningful state transition writes one row via `auditWrite()`. |

---

## 6. How a feature is built here (end-to-end flow)

A new reviewable feature typically touches these layers in this order:

```
1. Migration       src/migrations/00N_<slug>.sql            (add columns/tables; never edit a merged migration)
2. Repo            src/repositories.js                      (SQL + row mapper exported as `<entity>Repo.<method>`)
3. Service         src/services/<entity>.service.js         (business logic, validation, audit + notify)
4. Route           src/routes/<entity>.routes.js            (requireAuth + requireRole + joi validator + ah())
5. API client      frontend/src/lib/api.js                  (thin helper returning { data, error })
6. UI              frontend/src/pages/<Page>.jsx            (use toast, SectionLoader, PrimalLoader)
7. Nav             frontend/src/components/layout/AppShell.jsx + CommandPalette.jsx (expose under role gates)
8. Test            backend-node/tests/<entity>.test.js      (vitest — mock the service boundary)
```

Every status change writes via `statusEventsRepo.add()` AND `auditWrite()`. Every outbound user event (email/SMS) goes through `notifications.js#dispatch()` — it gracefully no-ops when creds are missing.

---

## 7. PDF generation — the critical invariants

The whole PDF layer is PDFKit-based and composable. The rules:

- **Never call `doc.text()` directly in composition code.** Use `lockedText(doc, str, x, y, options)` — it saves/restores `doc.y` so pdfkit's auto-paginator can't fire mid-draw.
- **Pagination is the caller's responsibility.** Services decide when to `doc.addPage()`; helpers draw within the current page.
- **Every page gets the ribbon.** `finalizePageRibbons(doc)` is called once, right before `doc.end()`. It stamps `Page X of Y · <signature>` at the bottom of every page.
- **Tagged PDF is on.** `baseDocumentOptions` sets `pdfVersion: '1.7'`, `tagged: true`, `displayTitle: true`. Don't override.
- **Metadata is required.** Every generator populates `doc.info.Title`, `.Author`, `.Subject`, `.Keywords`, `.CreationDate`. Missing values cause federation-mode QA to fail.
- **Filenames use `buildExportFilename()`** — never `application-${id}.pdf` style.

### Reusable primitives (import from `pdfComposition.js`)

- `drawApplicationCoverPage(doc, { profile, tournament, status, palette })`
- `drawRunningHeader(doc, { tournament, applicationId, status, palette })`
- `drawStatusBadge(doc, { status, x, y, palette })`
- `drawIdentityBlocks(doc, { blocks, x, y, width, palette })`
- `drawReportHeader(doc, { title, subtitle, meta, palette })`
- `drawKpiStrip(doc, { kpis, palette })` — top-bar KPI cards with highlight + delta
- `drawDataTable(doc, { columns, rows, palette })` — ink-header band + zebra stripes
- `drawStatusDistributionBar(doc, { segments, width, height, palette })` — stacked inline bar
- `drawSparkline(doc, { values, width, height, palette })`
- `layoutBracket(entries, { width, height, rounds })` → match coordinates
- `drawBracketTree(doc, layout, { palette })`
- `drawChampionCard(doc, { champion, palette })`

### Existing generators (most already implement the invariants)

- `applicationToPdf(res, applicationId, actor, ctx)` — credential-style cover + detail pages
- `applicationToPdfBuffer(applicationId, actor, ctx)` — same, but returns a Buffer (used by ZIP bulk)
- `bulkApprovedParticipantsToZip(res, actor, { tournamentId }, ctx)` — streaming archiver
- `approvedParticipantsToExcel(res, { tournamentId })` — two-sheet XLSX (Club / Individual)
- `analyticsToPdf(…)` + `analyticsToExcel(…)`
- `seasonalReportToPdf(…)` — multi-page yearbook
- `bracketToPdf(…)` + `divisionBracketToPdf(…)` — landscape classical tree

---

## 8. Notifications — resend + twilio + app push

`backend-node/src/notifications.js` is the one entrypoint. `dispatch({ userId, channels: ['email','sms'], template, payload })`:

- Loads templates from the `TEMPLATES` map (keys like `application.submitted`, `application.approved`, `application.needs_correction`, `auth.password_reset`, …).
- Each template exposes `subject(p)`, `html(p)` or `text(p)`, and optional `sms(p)`.
- **Gracefully no-ops** when creds are missing (`status='skipped'`). This is intentional — local dev and CI never need real creds.
- Logs one `notifications` row per recipient + channel with `provider_ref` or `error`.
- Resend is loaded lazily (`_resend`) so the process doesn't import it when no key is set.

**Env vars** (all optional locally, required in prod):

- `RESEND_API_KEY`, `RESEND_FROM` — transactional email
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — SMS + WhatsApp base
- `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` — from numbers
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob for document uploads (required in prod)

**Resending an email** — currently there is no first-class "resend" action. The pattern to add one: look up the original `notifications` row → call `dispatch()` with the same template + payload → log a new row with `metadata.resentOf`.

---

## 9. Auth + roles

- `users.role` enum: `applicant | club | reviewer | admin`
- JWT access token + refresh token. `signAccess`/`signRefresh` in `security.js`.
- Middleware: `requireAuth` attaches `req.user`; `requireRole('admin','reviewer')` gates routes.
- Frontend: `AuthContext` holds `user`, `ready`, `login`, `logout`. Protected routes are listed in `pages/_app.js`.

---

## 10. Common pitfalls (these have all bitten us)

- **Mutating `doc.y`** inside a PDF composition helper → phantom pages appear near bottom margin. Always use `lockedText`.
- **Assuming `weight_class` is non-null.** It's computed from `weight_kg` and can be null for not-yet-weighed participants. Reports must tolerate `null` (render `—`).
- **Filter by `deleted_at IS NULL` in every query.** Soft-delete is the convention; hard deletes are rare.
- **`UNIQUE (profile_id, tournament_id)` on `applications`.** One application per profile per tournament. Reapply issues to a *different* tournament.
- **`status_events` vs `audit_log`.** Both get written on every transition — status_events is per-application; audit_log is global.
- **Frontend state must survive `router.events`.** Pages can unmount during navigation; don't rely on locals to persist progress.
- **`next build` crash on a missing env var** — `NEXT_PUBLIC_BACKEND_URL` missing at build time produces a subtle runtime crash. Always set it in `.env.local`.
- **`@vercel/blob` requires `BLOB_READ_WRITE_TOKEN` in prod.** In dev, `storeInBlob` falls back to a retry loop that will eventually surface the missing token as an API 500.

---

## 11. Open roadmap (as of 2026-04-24)

All 7 Primal OS phases (PDF + UI redesign) have landed on `main`. See PRs #2 → #10.

**Next features (documented in `primal_next_plan.md` alongside this file):**

1. Season-scoped weigh-in (hide non-current-season participants)
2. Participant report — Excel + print-style PDF with name / sex / discipline / weight category
3. Applicant dashboard — current season only; archived history accessible but de-emphasized
4. Admin "Last season report" — complete historical multi-season report
5. Applicant dashboard — re-apply affordance surfaced, application viewing, edit-draft, status timeline
6. Album section — Primal Academy match photo gallery in admin panel, view for all
7. Resend-email action (admin review timeline)
8. Twilio SMS wiring verification + explicit SMS templates for approve/reject/correction

---

## 12. Writing style for new code

- **Comments describe the code in general, not the diff.** `// when slot height < 18pt we drop the club line` — good. `// phase 7: fixed the bug where names overlapped` — bad.
- **Minimal, focused edits.** Never mass-reformat unrelated files.
- **Follow neighbouring files.** Every page already has a pattern — mimic it.
- **No new third-party deps without justification.** Primal ships a small dep tree on purpose.
- **Tests for services, not routes.** Vitest covers `services/*.js` + `pdfTokens.js` + `pdfComposition.js`. Routes are thin.

---

## 13. Emergency handles

- **Reset local DB:** drop the database and re-run `npm run migrate && npm run seed`. Migrations are idempotent so a bare re-run on an existing DB is also safe.
- **Smoke-test every PDF:** `npm run smoke:export` writes samples to `backend-node/tmp/`.
- **Find a file's owner service:** `grep -rn "entityName" backend-node/src/services/`.
- **Reproduce a production status machine bug:** call the transition via the REST route, then inspect `status_events` for that `application_id` in the DB. The hash chain in `audit_log` will tell you if there's tampering.
- **CI is green but Vercel preview is broken:** check the preview's runtime env. `NEXT_PUBLIC_BACKEND_URL` needs to point at a reachable Render API.

---

## 14. Who to blame

`git blame` is fine but prefer reading the PR description that introduced a file — PR descriptions are the historical design docs for this repo. Every phase landed with a detailed `Review & Testing Checklist` that explains intent better than commit messages.

