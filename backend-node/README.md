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



## Neon checklist

- Use a Neon `DATABASE_URL` with `sslmode=require`
- Keep `PG_SSL=true`
- Keep `PG_SSL_REJECT_UNAUTHORIZED=true` in production
- Run `npm run migrate` before first traffic
- Run `npm run seed` only for demo or staging environments

## Render deployment

This repo includes [render.yaml](render.yaml) as a starting blueprint.

Recommended Render setup:

- Service type: `Web Service`
- Root directory: `backend-node`
- Build command: `npm install`
- Start command: `npm run migrate && npm start`
- Health check path: `/api/health`

## Deployment architecture

- Frontend: Netlify
- API: Render
- Database: Neon PostgreSQL

## Production-readiness notes

- Configure CORS using `WEB_BASE_URL`
- Move uploads from local disk to S3/R2/object storage before high-volume production
- Rotate `JWT_SECRET` and `PDF_SIGNATURE_SECRET` per environment
- Monitor `/api/health` and centralize logs from Render
- Keep older internal identifiers only where renaming would create migration risk

## API highlights

- Authentication and session refresh
- Profiles, clubs, tournament applications
- Review queue, SLA, appeals, audit export
- Tournament window management
- Admin weigh-in updates with recalculated weight class
- Public tournament, club, participant, and circular endpoints
