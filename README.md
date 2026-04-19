# TournamentOS — Project Map

Two deliverables live in this workspace:

```
/app
├── backend/            FastAPI + Mongo (original prototype scaffold — still running under supervisor)
├── backend-node/       ⭐ NEW — Node/Express + PostgreSQL production API (deploy manually)
└── frontend/           React web app (landing + auth + dashboards, now wired for Node API)
```

## What's new in this iteration

1. **Complete Node/Express + PostgreSQL backend** under `/app/backend-node`.
   - Auth (JWT + Google OAuth), profiles, clubs, applications, reviews, appeals,
     queue/SLA, reports (PDF/Excel), audit log (tamper-evident), public feed.
   - Self-registration paths for clubs **and** individuals.
   - Correction loop with window, SLA timers, hybrid reviewer assignment.
   - 13/13 tests passing (`cd backend-node && npm test`).
   - Won't run in this pod (no Postgres) — deploy manually per `backend-node/README.md`.

2. **Frontend API client** at `/app/frontend/src/lib/api.js`.
   - Every backend endpoint mapped as a typed-ish JS method.
   - Uses `REACT_APP_BACKEND_URL` + localStorage JWT.
   - Graceful fallback — existing mock prototype still works until the Node API
     is deployed.

3. **Redesigned premium landing page** at `/app/frontend/src/pages/Landing.jsx`.
   - Framer Motion scroll parallax on hero, split-word headline reveal.
   - Animated progress rail workflow scrollytelling section.
   - Admin-queue showcase card with subtle tilt-on-scroll.
   - Marquee of club names, stats block, quote, large gradient CTA.
   - Honours `prefers-reduced-motion` (all parallax + reveal disabled).
   - Three explicit CTAs — Apply Now / Club Onboarding / Admin Access.

4. **Continuation docs**:
   - `/app/backend-node/README.md` — full API surface + deploy guide.
   - `/app/backend-node/SKILLS.md` — task list for the next agent/team member
     (Flutter client, file uploads, custom form engine, payments, i18n, etc.).

## Deploy the API

```bash
cd /app/backend-node
cp .env.example .env         # fill DATABASE_URL, JWT_SECRET, (optional) Google + notification keys
createdb tournamentos        # or point at Supabase / Neon / RDS
yarn install
npm run migrate              # idempotent SQL migrations
npm run seed                 # demo tenant (password: demo1234)
npm test                     # 13 tests
npm start                    # API on :4000 (or $PORT)
```

Then set `REACT_APP_BACKEND_URL` on the web host to the API origin.

## Deploy the web app

Any static host (Netlify, Vercel, Cloudflare Pages):

```bash
cd /app/frontend
REACT_APP_BACKEND_URL=https://api.yourdomain.io yarn build
# upload /app/frontend/build
```

## Keep in mind

- The FastAPI backend at `/app/backend` is **not** the production path —
  it's the scaffold that ships with the Emergent template and currently just
  hosts a health endpoint used by the preview. Safe to delete once the Node
  backend is live.
- All role checks, status transitions, and actor-role gates are enforced
  server-side in `backend-node/src/statusMachine.js` + service layer.
- Audit log is append-only at the database level (trigger blocks UPDATE/DELETE);
  verify the hash chain with `GET /api/audit/verify`.
