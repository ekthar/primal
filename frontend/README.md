# Primal Frontend

This frontend is a Next.js Pages Router app for the Primal fight-operations platform.

## Requirements

- Node.js 20+
- npm

## Environment

Primary environment variable:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

Legacy fallback:

```bash
REACT_APP_BACKEND_URL=http://localhost:4000
```

If neither is set, frontend `/api/*` and `/uploads/*` requests are proxied to `http://localhost:4000` through Next rewrites.

Copy the example file if you want a local template:

```bash
cp .env.example .env.local
```

## Local development

Start the backend first:

```bash
cd ../backend-node
npm install
npm run migrate
npm run seed
npm run dev
```

Then start the frontend:

```bash
cd ../frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Seeded demo sign-in:

- `mei@primalfight.io`
- `luca@primalfight.io`
- password: `demo1234`

## Production build

```bash
npm run build
npm run start
```

## Netlify deployment

This repo includes [netlify.toml](../netlify.toml) configured for the frontend.

Recommended Netlify settings:

- Base directory: `frontend`
- Build command: `npm run build`
- Environment variable: `NEXT_PUBLIC_BACKEND_URL=https://your-render-service.onrender.com`

If your workspace root also contains a lockfile from another project tree, prefer building from `frontend/` directly to avoid lockfile ambiguity warnings.

## Cloudflare Pages deployment

This app can deploy to Cloudflare Pages as a static Next.js export.

Recommended Cloudflare Pages settings:

- Root directory: `frontend`
- Build command: `npm run build:cloudflare-pages`
- Build output directory: `out`
- Environment variable: `NEXT_PUBLIC_BACKEND_URL=https://your-api-origin.example.com`

The Cloudflare build writes static assets to `frontend/out` and uses [wrangler.toml](wrangler.toml) to declare that output directory for Pages.

## Notes

- User-facing branding is `Primal`.
- The landing page uses a WebGL cage-energy hero with reduced-motion fallback.
- Shared loaders are used across auth bootstrap, route transitions, admin settings, and the review queue.
