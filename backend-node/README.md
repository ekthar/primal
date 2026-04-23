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

- Frontend: Netlify
- API: Northflank
- Database: Neon PostgreSQL

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
