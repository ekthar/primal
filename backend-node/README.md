# TournamentOS — Backend (Node/Express + PostgreSQL)

Production-ready REST API for tournament registration and admin review.
Companion to the React web app at `/app/frontend`. Designed to be
**mobile-ready** (Flutter) from day one — all endpoints are JSON, stateless JWT.

## Stack

- Node.js ≥ 20, Express 4
- PostgreSQL 14+ (raw SQL migrations via `src/db/migrate.js`)
- JWT auth (access + refresh) + optional Google OAuth
- Notifications: Resend (email), Twilio (SMS + WhatsApp), push stub
- Exports: `pdfkit` (PDF) + `exceljs` (Excel)
- Validation: Joi
- Logs: pino

## Quick start

```bash
cd /app/backend-node
cp .env.example .env                  # fill DATABASE_URL, JWT_SECRET, keys
createdb tournamentos                 # or use a managed Postgres
yarn install                          # or npm install
npm run migrate                       # applies src/migrations/*.sql
npm run seed                          # demo users, club, tournament
npm run dev                           # starts on PORT (default 4000)
npm test                              # runs vitest suite
```

Health check: `GET /api/health`.

## Architecture

```
src/
 ├─ config.js            env-driven config object
 ├─ db.js                pg pool + transaction helper
 ├─ logger.js            pino
 ├─ apiError.js          ApiError class + helpers
 ├─ middleware.js        auth, validate, error, async helper
 ├─ statusMachine.js     6-status FSM + transition guards
 ├─ security.js          bcrypt + JWT
 ├─ validators.js        Joi schemas per domain
 ├─ notifications.js     email/sms/whatsapp/push dispatcher
 ├─ audit.js             tamper-evident append-only audit log
 ├─ repositories.js      SQL data access (thin)
 ├─ services/            business logic per domain
 │   ├─ auth.service.js
 │   ├─ profile.service.js
 │   ├─ club.service.js
 │   ├─ application.service.js
 │   ├─ review.service.js
 │   ├─ queue.service.js
 │   ├─ appeal.service.js
 │   └─ export.service.js
 ├─ routes/              Express routers per domain
 │   ├─ auth.routes.js
 │   ├─ profile.routes.js
 │   ├─ club.routes.js
 │   ├─ application.routes.js
 │   ├─ review.routes.js
 │   ├─ queue.routes.js
 │   ├─ appeal.routes.js
 │   ├─ report.routes.js
 │   ├─ audit.routes.js
 │   └─ public.routes.js
 ├─ db/
 │   ├─ migrate.js
 │   └─ seed.js
 └─ migrations/
     └─ 001_init.sql
tests/
 ├─ smoke.test.js
 ├─ status-transitions.test.js
 └─ validators.test.js
```

## API surface (high-level)

### Auth
- `POST /api/auth/register` — email + password
- `POST /api/auth/login`
- `POST /api/auth/google` — idToken
- `GET  /api/auth/me`
- `POST /api/auth/logout`

### Profile (reusable across tournaments)
- `GET  /api/profiles/me`
- `PUT  /api/profiles/me`
- `GET  /api/profiles/:id`

### Clubs
- `POST /api/clubs`
- `GET  /api/clubs`
- `PATCH /api/clubs/:id`
- `POST /api/clubs/:id/approve`   (admin only)

### Applications (individual + via club)
- `POST /api/applications`
- `GET  /api/applications`
- `GET  /api/applications/:id`
- `PATCH /api/applications/:id`   (draft or during correction window)
- `POST /api/applications/:id/submit`

### Review (admin + reviewer)
- `POST /api/reviews/:id/assign`
- `POST /api/reviews/:id/start`
- `POST /api/reviews/:id/decision`  (approve / reject / request_correction)
- `POST /api/reviews/bulk/decision`
- `POST /api/reviews/:id/reopen`    (admin only)

### Queue & SLA
- `GET  /api/queue`
- `GET  /api/queue/sla`
- `GET  /api/queue/workload`

### Appeals
- `POST /api/appeals`
- `GET  /api/appeals/open`
- `POST /api/appeals/:id/decision`  (admin — grants reopen)

### Reports & Exports
- `GET /api/reports/summary`
- `GET /api/reports/approved.xlsx`
- `GET /api/reports/applications/:id.pdf`

### Audit (admin)
- `GET /api/audit/entity/:type/:id`
- `GET /api/audit/verify`
- `GET /api/audit/export.xlsx`

### Public
- `GET /api/public/tournaments`
- `GET /api/public/clubs`
- `GET /api/public/participants`  (approved only)

## Workflow (status machine)

```
draft ─submit──► submitted ─start──► under_review ─approve──► APPROVED
                                 │                 │
                                 │                 ├─reject──► REJECTED
                                 │                 │
                                 │                 └─request_correction──► needs_correction
                                 │                                              │
                                 └─request_correction/reject/approve──► ...     │
                                                                                │
                         needs_correction ─resubmit──► submitted ◄──────────────┘

Admin overrides:
  REJECTED ─admin reopen──► under_review
  APPROVED ─admin reopen──► under_review   (e.g. after granted appeal)
```

Guards in `src/statusMachine.js` enforce both the transition and the actor role.

## Notifications

Priority order: **email → push → whatsapp → sms**. Configure any subset;
missing channels quietly log as `skipped`. Resend for email, Twilio for SMS
and WhatsApp. Templates live in `src/notifications.js`.

## Audit log

Every state-changing action appends a row to `audit_log` with a hash chain:
`hash = sha256(prev_hash || canonical(payload))`. The `audit_immutable_guard`
trigger blocks UPDATE/DELETE at the DB level. Verify integrity with
`GET /api/audit/verify` or `node -e "require('./src/audit').verifyChain().then(console.log)"`.

## Deployment notes

- **Frontend** (Netlify / Vercel): build the React app; set
  `REACT_APP_BACKEND_URL` to your API origin.
- **API** (Render / Fly / Railway / Bare VM): run `npm run migrate && npm start`.
  Provision a managed PostgreSQL (Supabase, Neon, RDS).
- Put `UPLOAD_DIR` on persistent storage or swap the static `/uploads` handler
  for S3/R2 when you're ready.
- Rotate `JWT_SECRET` per environment.

## What's next

See `SKILLS.md` for a task-by-task continuation plan (Flutter API client,
file storage, payments, custom form engine, i18n).
