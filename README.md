# CASES.

A premium, dark-mode case-management platform for a U.S. entity formation
practice — leads, companies, the people behind them, and the matters in flight.

> **New here?** `CLAUDE_HANDOFF.md` is the state of the project: what works,
> what is a prototype, and what is deliberately unfinished. `CLAUDE.md` is the
> working guide for the codebase. `CHANGELOG.md` lists what changed and when.

## What's in it

- **Dashboard** — live stats, recent cases, tasks, 30-day trend.
- **Leads** — pipeline with conversion into an Account, Contact and optional
  first Case.
- **Records** — one workspace with three tabs:
  - **Accounts** (companies) — ~46 inline-editable fields, linked contacts,
    their cases, and **New case** pre-set to the account.
  - **Clients** (people) — linked companies and cases, and **New case**
    pre-set to the client (pick the company if they have several).
  - **Cases** — Table, Cards and Board views; filters by status, priority,
    assignee and search. The table sorts by **Case #** or **Created**
    (click: ascending → descending → back to Last Modified).
- **Case detail** — Overview (with separate Client and Account links),
  Contacts, Thread, Tasks, Documents and **Automations**.
- **Case automations** — build, name and save visual workflows per case, or
  share one globally with every case; customize a global for one case and
  revert. *Management only — automations are not executed yet.*
- **Messages** — team DMs and groups with case tagging and `@mention` alerts.
- **Insights** — charts over cases and assignees.
- **Accounting** and **Settings** are front-end prototypes with no backend.

## Stack

- **Frontend** — React 19 + Vite 5 + TypeScript, Tailwind v4 (beta), Framer
  Motion, Wouter, TanStack Query, Lucide, Recharts
- **Backend** — Node 20+ / Express 5 / TypeScript, Zod validation, Pino
  logging, esbuild for builds. No database required.
- **Monorepo** — pnpm workspaces

## Workspace layout

```
cases-app/
├─ artifacts/
│  ├─ cases/         React + Vite frontend
│  └─ api-server/    Express backend + JSON-backed store (+ test/)
└─ lib/
   ├─ db/                Drizzle/Postgres schema — stale, not wired up
   ├─ api-spec/          OpenAPI 3.1 — stale, covers ~25% of the API
   └─ api-client-react/  Orval target — never generated
```

The three `lib/` packages predate the current data model and are **not** in the
running path. See CLAUDE_HANDOFF.md §6.4 before touching them.

## First run

You need **Node 20+** and **pnpm 9**.

```bash
cd cases-app

corepack enable
corepack prepare pnpm@9.0.0 --activate   # the version this repo pins

pnpm install --frozen-lockfile
pnpm dev
```

That starts the API on `http://localhost:3001` and Vite on
`http://localhost:5173`. Open the Vite URL.

Sign in with any of the seeded users — password `test123` for all three:

| Email | Role |
|---|---|
| `iris@example.com` | admin |
| `devon@example.com` | case manager |
| `sara@example.com` | case manager |

> Coming from another machine? `node_modules` is platform-specific. Delete it
> and reinstall rather than copying it across.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Frontend and API in parallel |
| `pnpm dev:api` | API only |
| `pnpm dev:web` | Frontend only |
| `pnpm typecheck` | TypeScript across the workspace — currently clean |
| `pnpm test` | Test suite (Vitest + Supertest) — 262 tests in 20 files |
| `pnpm build` | Production builds for everything |
| `pnpm api:generate` | Orval regen — **don't**, the spec it reads is stale |

The test suite covers the API plus a few pure frontend modules (Records
routing, record links, table sorting). React components are not tested, there
is no CI, and there is no lint step (`pnpm lint` is a no-op). Tests run against
throwaway data and never touch `store.json`.

## Data

The API keeps everything in memory and persists the whole store to
`artifacts/api-server/data/store.json` after every successful write.

- The file **survives restarts**. It is git-ignored.
- To reset to the demo dataset, delete it and restart the API — the seed in
  `artifacts/api-server/src/store.ts` re-runs.
- `store.snapshot.json` beside it is a committed restore point. Copy it over
  `store.json` and restart to return to the recovered state. It predates
  automations, so it restores with none.
- An older `store.json` keeps working after upgrades: collections added since
  (such as automations) are filled in empty on load; existing records are not
  changed.

Seeded content: 17 companies, 21 contacts, 8 leads, 15 cases across every
status and priority, 65 tasks, 12 documents, 15 logged interactions and one
global automation. Messaging starts empty — conversations are created from the
UI. Everything is fictional.

## Switching to Postgres

`lib/db/` holds a Drizzle schema **written against the previous data model**.
It has no tables for accounts, contacts, account-contact links, leads, users,
case interactions, thread entries, mentions or automations — most of the live
domain —
and no migrations have been generated. Switching is a real project, not a
configuration change. Rewrite the schema first.

## Notes

- Old list URLs (`/accounts`, `/clients`, `/contacts`, `/customers`,
  `/cases`, `/records`) redirect to the matching Records tab; `/workflow`
  redirects to Records → Cases. Detail URLs (`/accounts/:id`,
  `/clients/:id`, `/cases/:id`) are unchanged.
- Messages live in the floating widget that `AppLayout` renders on every page.
  The `/messages` route is a roomier full-page version, intentionally absent
  from the sidebar.
- The API base URL is `import.meta.env.BASE_URL + /api/...`, so the app works
  behind a sub-path proxy.
- Vite binds `0.0.0.0` and reads `VITE_PORT`/`PORT`, so it works in cloud IDEs.
- Auth is a demo: plaintext passwords, an `X-User` header the server trusts,
  and no protected routes. Don't expose this to a network you don't control.
