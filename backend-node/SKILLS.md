# SKILLS.md — TournamentOS continuation plan

> Use this file as the hand-off for any future agent (or teammate) who picks up
> the project. Each skill is a self-contained, execution-ready task.

## How to resume

1. `cd /app/backend-node && yarn install` — deps are already pinned.
2. Copy `.env.example` → `.env`; fill `DATABASE_URL` and `JWT_SECRET` at minimum.
3. `npm run migrate && npm run seed`.
4. `npm run dev` — API on `http://localhost:4000`.
5. `cd /app/frontend && yarn start` — web app on `http://localhost:3000`,
   set `REACT_APP_BACKEND_URL=http://localhost:4000`.

## Status so far

| Area                              | State      |
|-----------------------------------|------------|
| Auth (JWT + Google)               | done       |
| Profiles                          | done       |
| Clubs (self-register + manage)    | done       |
| Tournaments (read-only)           | done       |
| Applications + status machine     | done       |
| Review pipeline + correction loop | done       |
| SLA / queue board                 | done       |
| Appeals + reopen                  | done       |
| Bulk review actions               | done       |
| Notifications (email/SMS/WA/push) | email+sms+wa live, push stub |
| Audit log (tamper-evident)        | done       |
| Exports (PDF, Excel)              | done       |
| Public approved feed              | done       |
| Tests (status FSM, smoke, validators) | done   |
| Custom form schema runtime        | schema stored; UI renderer TODO |
| File uploads (medicals / photos)  | schema + route stub; real storage TODO |
| Soft-delete recovery endpoints    | DB ready; admin UI TODO |
| Multilingual copy                 | `locale` + `translations` jsonb ready; i18n strings TODO |

---

## Skill 1 — Flutter API client (mobile-first)

**Goal**: autogen a typed Dart client so the Flutter app stays in lock-step.

```bash
# Option A — hand-written: create /mobile/lib/api/ with thin Dio client,
#   one file per domain mirroring src/routes/*.routes.js.
# Option B — generated: add openapi.yaml in /app/backend-node/docs/
#   and run openapi-generator to emit lib/api.
```

- Base URL: `REACT_APP_BACKEND_URL` (web) / `API_BASE_URL` (mobile).
- Token storage: `flutter_secure_storage`.
- Refresh flow: on 401, POST `/api/auth/refresh` once, retry; logout on second 401.
- Endpoints grouped by feature; reuse the same request/response shapes the web uses.

## Skill 2 — File uploads (medicals, ID scans, photos)

Backend:
1. Add `POST /api/applications/:id/documents` (multer, `kind` + file).
2. Persist to S3/R2 (current code uses local `uploads/`).
3. Return signed URLs with short TTL for reads.

Frontend: Register wizard step 3 currently UI-only; wire a dropzone to the new endpoint and attach `documentIds[]` to `formData`.

## Skill 3 — Custom form schema engine

`tournaments.form_schema` is a JSON array:
```json
[
  { "key": "reach_cm", "label": "Reach (cm)", "type": "number", "required": false, "i18n": { "ja": "リーチ (cm)" } },
  { "key": "style_notes", "label": "Fighting style notes", "type": "text" }
]
```

Build:
1. A renderer in `/app/frontend/src/components/forms/DynamicField.jsx`.
2. A validator in `src/validators.js` that merges base schema with per-tournament schema.
3. Admin editor UI at `/admin/tournaments/:id/form`.

## Skill 4 — Payments placeholder → live Stripe

- Add `payments` table (`application_id`, `provider`, `intent_id`, `amount_cents`, `currency`, `status`).
- Keep `POST /api/applications/:id/submit` gated on `payment_status='paid'` when tournament has `entry_fee_cents > 0`.
- For go-live, call `integration_playbook_expert_v2` with `INTEGRATION: Stripe`; reuse the test key in the pod env.

## Skill 5 — Notifications UI preferences

Add `notification_preferences` per user (jsonb: `{email:true,sms:false,...}`). Honour in `notifications.js`.

## Skill 6 — i18n

- Backend already stores `locale` per user and `translations` jsonb on tournaments/clubs.
- Frontend: wrap in `react-i18next`; extract strings to `/app/frontend/src/i18n/{en,ja,pt,fr}.json`.

## Skill 7 — Soft delete & recovery

Routes to add (admin):
- `DELETE /api/clubs/:id` → soft
- `POST /api/admin/trash/:entity/:id/restore`
- `GET /api/admin/trash` (paginated)

All entities already use `deleted_at`.

## Skill 8 — Performance & observability

- Add `pg_stat_statements` + slow-query log.
- Introduce per-route histograms (prom-client).
- Cache `/api/public/*` with `s-maxage=60` + ETag.

## Skill 9 — Landing page animation polish pass

Hero uses Framer Motion scroll triggers already. Candidates for upgrade:
- Marquee of club logos with infinite scroll.
- Pinned "workflow scrollytelling" section replacing current static workflow card.
- Add reduced-motion fallbacks if missing anywhere.

---

## Naming conventions (do not drift)

- Tables: plural, snake_case (`applications`, `status_events`).
- Enums: snake_case values (`needs_correction`, never `needsCorrection`).
- API paths: kebab-case plural (`/api/applications`, `/api/reviews/:id/decision`).
- JSON fields in API responses: camelCase (`reviewerId`, `correctionDueAt`).
- JavaScript: camelCase for variables, PascalCase for classes, UPPER_SNAKE for constants.

## Response contract

All errors:
```json
{ "error": { "code": "UPPER_SNAKE_CODE", "message": "human-readable", "details": { "...": "optional" } } }
```

Success endpoints return a top-level object with a named payload field
(e.g. `{ "application": {...} }`, `{ "items": [...] }`) — never bare arrays.
