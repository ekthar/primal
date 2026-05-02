# Primal API

Express + PostgreSQL backend for the Primal fight-operations platform.

## Stack

- Node.js 20+
- Express
- PostgreSQL
- Joi validation
- JWT auth
- `pdfkit` and `exceljs` exports
- Pino logging

## Local setup

```bash
cd backend-node
npm install
npm run migrate
npm run seed
npm run dev
```

Run tests with:

```bash
npm test
```

## Core environment variables

- `NODE_ENV`
- `PORT`
- `APP_BASE_URL`
- `WEB_BASE_URL`
- `DATABASE_URL`
- `PG_SSL`
- `PG_SSL_REJECT_UNAUTHORIZED`
- `JWT_SECRET`
- `PDF_SIGNATURE_SECRET`
- `PDF_LOGO_PATH`
- `UPLOAD_DIR`
- `UPLOAD_STORAGE_PROVIDER`
- `MAX_UPLOAD_MB`

## Neon checklist

- Use a Neon `DATABASE_URL` with `sslmode=require`
- Keep `PG_SSL=true`
- Keep `PG_SSL_REJECT_UNAUTHORIZED=true` in production
- Run `npm run migrate` before first traffic
- Run `npm run seed` only for demo or staging environments

## Northflank deployment

Recommended setup:

- Service type: `Combined service`
- Repository root: this repository
- Build type: `Dockerfile`
- Build context: `backend-node`
- Dockerfile path: `backend-node/Dockerfile`
- Public port: `4000` over `HTTP`
- Health check path: `/api/health`

Runtime variables to configure in Northflank:

- `NODE_ENV=production`
- `PORT=4000`
- `APP_BASE_URL=https://<your-northflank-domain>`
- `WEB_BASE_URL=https://<your-frontend-domain>`
- `DATABASE_URL=<your-postgres-url>`
- `PG_SSL=true`
- `PG_SSL_REJECT_UNAUTHORIZED=true`
- `JWT_SECRET=<secret>`
- `PDF_SIGNATURE_SECRET=<secret>`

Notes for Northflank:

- The Docker image runs `npm run migrate && npm start` on container start.
- Northflank can auto-detect the exposed port from the Dockerfile, but confirm that port `4000` is publicly exposed.
- If you keep `UPLOAD_STORAGE_PROVIDER=local`, attach a persistent volume and set `UPLOAD_DIR` to that mounted path. Without a volume, uploaded files are ephemeral.
- If you continue using Neon PostgreSQL, keep `sslmode=require` in `DATABASE_URL`.

## Deployment architecture

- Frontend: Cloudflare Pages
- API: Oracle Cloud Always Free VM or any always-on Node host
- Database: PostgreSQL on the same VM for the free Oracle setup, or a managed PostgreSQL provider

## Oracle Cloud Always Free VM deployment

Use this when you want the backend to behave like a normal always-on Node server instead of a serverless function.

Repository templates:

- `deploy/oracle/primal-api.service` - systemd service for the API
- `deploy/oracle/primal-api.env.example` - production environment template for Oracle VM + local PostgreSQL
- `deploy/oracle/Caddyfile.example` - HTTPS reverse proxy example

Runtime choices:

- `DATABASE_URL=postgresql://primal:<password>@127.0.0.1:5432/primal`
- `PG_SSL=false`
- `UPLOAD_STORAGE_PROVIDER=local`
- `UPLOAD_DIR=/var/lib/primal/uploads`
- `WEB_BASE_URL=<your Cloudflare Pages URL>`
- `CORS_ORIGINS=<your Cloudflare Pages URL>,<your custom frontend domain>`

Oracle does not need a special code path. The existing backend uses the normal `pg` driver and reads all deployment behavior from environment variables.

## Production-readiness notes

- Configure CORS using `WEB_BASE_URL`
- Use a persistent volume or object storage for uploads in production
- Rotate `JWT_SECRET` and `PDF_SIGNATURE_SECRET` per environment
- Monitor `/api/health` and centralize logs from Northflank
- Keep older internal identifiers only where renaming would create migration risk

## API highlights

- Authentication and session refresh
- Profiles, clubs, tournament applications
- Review queue, SLA, appeals, audit export
- Tournament window management
- Admin weigh-in updates with recalculated weight class
- Public tournament, club, participant, and circular endpoints
