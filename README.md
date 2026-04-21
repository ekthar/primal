# Primal

Primal is a fight-operations platform for MMA and martial arts events. This workspace contains the production web app, the Node API, and the older prototype backend that can be retired once the Node stack is fully deployed.

## Workspace

```text
frontend/       Next.js Pages Router app
backend-node/   Express + PostgreSQL API
backend/        Legacy prototype backend
```

## Production architecture

- `Netlify` hosts the frontend
- `Render` hosts the Node API
- `Neon` hosts PostgreSQL

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Primary environment variable:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

`REACT_APP_BACKEND_URL` remains as a legacy fallback, but `NEXT_PUBLIC_BACKEND_URL` is the default going forward.

## Backend

```bash
cd backend-node
npm install
npm run migrate
npm run seed
npm run dev
```

Seeded demo sign-in:

- `mei@primalfight.io`
- `luca@primalfight.io`
- password: `demo1234`

## Deployment

- Netlify config lives in [netlify.toml](/C:/Users/EKTHAR/.codex/worktrees/14cc/primal/netlify.toml)
- Render blueprint lives in [render.yaml](/C:/Users/EKTHAR/.codex/worktrees/14cc/primal/backend-node/render.yaml)
- Detailed setup lives in:
  - [frontend/README.md](/C:/Users/EKTHAR/.codex/worktrees/14cc/primal/frontend/README.md)
  - [backend-node/README.md](/C:/Users/EKTHAR/.codex/worktrees/14cc/primal/backend-node/README.md)

## Notes

- Some internal keys still use older `tos-*` names to avoid unnecessary migration risk.
- The frontend now uses a shared Primal loading system, branded export filenames, and a WebGL cage-energy hero with reduced-motion fallback.
