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

## Demo credentials

- `mei@primalfight.io`
- `luca@primalfight.io`
- password: `demo1234`

## Core environment variables

```bash
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://user:password@your-neon-endpoint.neon.tech/dbname?sslmode=require
PG_SSL=true
PG_SSL_REJECT_UNAUTHORIZED=true
JWT_SECRET=replace-this
APP_BASE_URL=https://your-render-service.onrender.com
WEB_BASE_URL=https://your-netlify-site.netlify.app
RESEND_API_KEY=
RESEND_FROM=Primal <no-reply@primalfight.io>
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SMS_FROM=
TWILIO_WHATSAPP_FROM=
PDF_BRAND_NAME=Primal
PDF_BRAND_PRIMARY=#0b0b0b
PDF_BRAND_ACCENT=#ef1a1a
PDF_LOGO_PATH=./assets/primal-logo.png
PDF_SIGNATURE_SECRET=replace-this-too
PDF_VERIFY_BASE_URL=https://your-render-service.onrender.com/api/public/verify/application-signature
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10
```

## Neon checklist

- Use a Neon `DATABASE_URL` with `sslmode=require`
- Keep `PG_SSL=true`
- Keep `PG_SSL_REJECT_UNAUTHORIZED=true` in production
- Run `npm run migrate` before first traffic
- Run `npm run seed` only for demo or staging environments

## Render deployment

This repo includes [render.yaml](/C:/Users/EKTHAR/.codex/worktrees/14cc/primal/backend-node/render.yaml) as a starting blueprint.

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
