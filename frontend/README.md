# TournamentOS Frontend (Next.js)

This frontend is a Next.js app using the Pages Router and Tailwind-based UI components.

## Requirements

- Node.js 20+
- npm or yarn

## Environment

Set backend URL with one of these variables:

- `NEXT_PUBLIC_BACKEND_URL` (preferred)
- `REACT_APP_BACKEND_URL` (legacy fallback)

Example:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

If unset, frontend `/api/*` and `/uploads/*` requests are proxied to `http://localhost:4000` via Next rewrites in dev/build runtime.

## Install

```bash
cd frontend
npm install
```

## Run Development Server

```bash
npm run dev
```

Open http://localhost:3000.

## Admin-First Local Setup

Start backend first so auth/public endpoints are available:

```bash
cd ../backend-node
npm install
npm run migrate
npm run seed
npm run dev
```

Then start frontend (`cd ../frontend; npm run dev`) and sign in with the seeded admin account:

- Email: `mei@tournamentos.io`
- Password: `demo1234`

After admin login, you can continue with tournament and participant workflows.

## Build for Production

```bash
npm run build
npm run start
```

## Notes

- Role dashboards are under `/applicant`, `/club`, and `/admin/*`.
- Authentication tokens are stored in local storage by the frontend API client.
- Most pages now consume live backend APIs; make sure the backend is running and seeded.
