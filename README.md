# CASES.

A premium, dark-mode SaaS case management platform.

## Stack

- **Frontend** — React 19 + Vite + TypeScript, Tailwind v4, Framer Motion, Wouter, TanStack Query, Lucide, Recharts
- **Backend** — Node 20 + Express 5 + TypeScript, Pino logging, esbuild. Uses an in-memory store seeded at boot, so no database is required to run the app.
- **Database (optional)** — A complete Drizzle/PostgreSQL schema lives in `lib/db/` for when you're ready to switch. The API server is structured so swapping is a one-file change.
- **API contract** — OpenAPI 3.1 in `lib/api-spec/openapi.yaml`. Orval can generate typed React Query hooks into `lib/api-client-react/`.
- **Monorepo** — pnpm workspaces

## Workspace layout

```
cases-app/
├─ artifacts/
│  ├─ cases/         # React + Vite frontend
│  └─ api-server/    # Express backend (in-memory store)
└─ lib/
   ├─ db/                # Drizzle schema + seed (optional Postgres backend)
   ├─ api-spec/          # OpenAPI 3.1 YAML
   └─ api-client-react/  # Orval output (typed React Query hooks)
```

## First run

You only need **Node 20+** and **pnpm**.

If you don't have pnpm yet, in PowerShell run:

```powershell
npm install -g pnpm
```

Then:

```powershell
cd C:\Users\IrisBurgos\Desktop\CRM\cases-app
pnpm install
pnpm dev
```

This starts the API on `http://localhost:3001` and the Vite dev server on `http://localhost:5173`. Open `http://localhost:5173` in your browser. The app comes pre-loaded with 5 customers, 5 cases across every status/priority, 9 tasks, 4 documents, and 2 message threads.

> The in-memory store resets every time you restart the API. That's intentional — keep iterating on the UI without worrying about migrations. When you're ready to persist, see "Switching to Postgres" below.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the frontend and API in parallel |
| `pnpm dev:api` | API server only |
| `pnpm dev:web` | Frontend only |
| `pnpm api:generate` | Regenerate `lib/api-client-react` from the OpenAPI spec via Orval |
| `pnpm build` | Production builds for everything |
| `pnpm typecheck` | TypeScript across the workspace |

## Switching to Postgres

The Drizzle schema and seed in `lib/db/` mirror the in-memory store exactly. To switch:

1. Install Postgres and create a database (e.g. `cases`).
2. Add `DATABASE_URL` to `.env`.
3. From `lib/db/`, run `pnpm drizzle-kit push` and `pnpm seed`.
4. In `artifacts/api-server/src/routes.ts`, swap the `./store.js` imports for `@cases/db` and convert the array operations to Drizzle queries (the file already follows that shape).

## Notes

- The Messages experience lives entirely in the floating widget that sits in `AppLayout` on every page. The `/messages` route exists for a roomier full-page version but is not in the sidebar nav.
- API base URL is computed as `import.meta.env.BASE_URL + /api/...` so the app works behind a sub-path proxy.
- Vite dev server binds `0.0.0.0` and reads `PORT` from env so it works in cloud IDEs.
