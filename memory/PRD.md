# TournamentOS — Product Requirements Document

**Created:** Feb 2026  
**Status:** v1 MVP — Frontend-only UI system shipped

## Original Problem Statement
Build a premium web UI system for a tournament registration and admin-review platform, inspired by Notion + macOS + iOS. Clean, elegant, high cognitive clarity. Mobile-first. Include: design system tokens, component library, page compositions (public registration, club dashboard, applicant dashboard, admin review queue, reviewer workbench, appeals, reports), interaction specs (validation, correction window, bulk actions), accessibility, and clear workflow status styling.

## User Choices
- **Scope:** Frontend-only UI prototype with mocked data
- **Auth:** Mocked JWT with role selector (admin / reviewer / club / applicant)
- **Domain:** Martial arts / MMA (incl. low-kick, low-contact, full-contact)
- **Theme:** Light + Dark with toggle
- **Priority:** All pages roughly equal depth, admin queue + workbench + correction inbox highlighted

## Personas
- **Admin (Federation lead):** Oversees queue, bulk-approves, runs reports.
- **Reviewer:** Deep reviews, approves/rejects, requests corrections.
- **Club coordinator:** Registers fighters, resolves correction inbox.
- **Applicant (Fighter):** Tracks personal application status, fixes flagged fields.

## Core Requirements
- Design tokens (colors, typography, spacing, motion) in CSS vars + Tailwind.
- 6 workflow statuses with distinct pill styles: draft, submitted, under_review, needs_correction, approved, rejected.
- All shadcn components; Cabinet Grotesk (display) + Manrope (body) + JetBrains Mono (data) via Fontshare.
- Light/dark toggle persisted in localStorage.
- Mock JWT auth with role switch.
- Fully responsive; mobile topbar + desktop sidebar.

## What's Been Implemented (Feb 2026)
- [x] Visual foundation (tokens, fonts, glass, grain, animations)
- [x] Landing page with hero, features, workflow preview
- [x] Login (role selector, mock JWT, role-based redirect)
- [x] Public Registration 4-step wizard with inline validation
- [x] Admin Review Queue (dense table, status tabs, search, club filter, bulk approve / bulk correction with confirm modal, bulk-action floating bar)
- [x] Reviewer Workbench (split-pane, bento metrics, timeline, auto-checks, approve / reject, correction drawer)
- [x] Club Dashboard (stat cards, correction inbox tab, roster tab, resubmit flow)
- [x] Applicant Dashboard (status tracker, notes banner, timeline, summary)
- [x] Appeals page (list + verdict workbench)
- [x] Reports page (KPIs, bar chart, discipline bars, CSV/PDF export toasts)
- [x] Sidebar role switcher (instant swap between demo dashboards)
- [x] Data-testid coverage across all interactive elements
- [x] Testing subagent pass @ ~97%

## Backlog (P0 → P2)
**P1**
- Seed multi-event structure (season > event > bracket)
- Public brackets & results page
- Weigh-in day mode for officials (tablet-optimized)

**P2**
- Real backend (FastAPI + MongoDB) replacing mock
- Fighter profile CRUD with photo upload
- CSV import of rosters
- Email notification workflow preview
- Signed medical upload (file storage integration)
- Fine-grained permissions (reviewer cannot approve their own club)

## Next Tasks
1. Hook the UI to a real FastAPI + MongoDB backend.
2. Replace mock JWT with proper auth (choose between custom JWT and Emergent Google Auth).
3. Add event/bracket management.
4. Add real file upload for medical certificates.

## Iteration 2 — Feb 2026 — Backend + Landing Redesign
- [x] Full **Node/Express + PostgreSQL** backend at `/app/backend-node` (auth JWT+Google, profiles, clubs, applications, reviews with hybrid assignment, appeals, queue+SLA, reports PDF/Excel, tamper-evident audit log, public feed, notifications via Resend/Twilio, correction window, bulk actions, soft-delete ready)
- [x] 10 SQL-indexed tables + status_events + audit_log with hash chain + DB trigger blocking updates/deletes
- [x] 13/13 backend tests passing (status machine, validators, smoke)
- [x] Frontend API client (`/app/frontend/src/lib/api.js`) wiring every endpoint
- [x] Premium landing page with Framer Motion scroll parallax, workflow scrollytelling, animated admin showcase, marquee, stats, testimonial, triple CTA — honours `prefers-reduced-motion`
- [x] `backend-node/README.md` + `backend-node/SKILLS.md` continuation docs
- [x] `/app/README.md` project map

## P1 Follow-ups
1. Deploy Postgres + Node backend (Render / Supabase / Fly) and point `REACT_APP_BACKEND_URL` at it
2. Flutter client (hand-written Dio OR openapi-generated from `/app/backend-node/docs/openapi.yaml`)
3. File upload service (S3/R2) for medical certs & photos
4. Payments (Stripe test key already in env)
5. Custom form schema renderer (schema column + jsonb already in DB)
6. i18n — bundle translations on top of existing `locale` + `translations` jsonb fields
