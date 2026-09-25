# CASES.

A premium, dark-mode case-management platform for a U.S. entity formation
practice — leads, companies, the people behind them, and the matters in flight.

> **New here?** `CLAUDE_HANDOFF.md` is the state of the project: what works,
> what is a prototype, and what is deliberately unfinished. `CLAUDE.md` is the
> working guide for the codebase. `CHANGELOG.md` lists what changed and when.

## What's in it

- **Dashboard** — personalized by permissions: each employee sees only the
  widgets their role allows (their cases, their team's workload, their leads,
  employee figures for HR…), computed on the server from real records.
- **Leads** — pipeline with conversion into an Account, Contact and optional
  first Case.
- **Records** — one workspace with three tabs:
  - **Accounts** (companies) — ~46 inline-editable fields, linked contacts,
    their cases, and **New case** pre-set to the account.
  - **Clients** (people) — linked companies and cases, and **New case**
    pre-set to the client (pick the company if they have several).
  - **Cases** — Table, Cards and Board views; filters by status, priority,
    category, escalation, assignee and search. The table sorts by **Case #** or **Created**
    (click: ascending → descending → back to Last Modified).
- **Case detail** — Overview (with separate Client and Account links),
  Contacts, Thread, Tasks, Documents and **Automations**; a primary
  **category**, manual **escalations** with reason and history, closed date
  and resolution time (when known), and the lifecycle history. The
  **Thread** is the Case's timeline: comments plus automatic activity
  (status, category, priority, owner, escalations, tasks, documents with
  links, logged emails/meetings) and one summary card each for outgoing
  and incoming phone calls.
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
   ├─ access/            Roles, permissions, Account field rules, navigation metadata
   ├─ db/                Drizzle/Postgres schema — stale, not wired up
   ├─ api-spec/          OpenAPI 3.1 — stale, covers ~25% of the API
   └─ api-client-react/  Orval target — never generated
```

`lib/access` is the shared role-based access core (used by the API; the web app
imports its types). The other three `lib/` packages predate the current data
model and are **not** in the running path. See CLAUDE_HANDOFF.md §6.4 before touching them.

## First run

You need **Node 20+** and **pnpm 9**.

```bash
cd cases-app

corepack enable
corepack prepare pnpm@9.0.0 --activate   # the version this repo pins

pnpm install --frozen-lockfile
pnpm dev
```

That starts the API on `http://127.0.0.1:3001` and Vite on
`http://127.0.0.1:5173`. Open the Vite URL. Both listen on this machine only
(see Notes to change that).

Sign in with any of these accounts — password `test123` for all:

| Email | Role | |
|---|---|---|
| `iris@example.com` | System Owner | |
| `devon@example.com` | CSR | |
| `sara@example.com` | CSR | |
| `nadia@example.com` | CSR Supervisor | demo |
| `leo@example.com` | Business Advisor | demo |
| `grace@example.com` | Business Advisor Supervisor | demo |
| `omar@example.com` | Admin | demo |
| `rachel@example.com` | Admin Supervisor | demo |
| `tessa@example.com` | HR | demo |

Roles are recorded but do not yet change what anyone can see or do — that
arrives with the role-based access phases.

> Coming from another machine? `node_modules` is platform-specific. Delete it
> and reinstall rather than copying it across.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Frontend and API in parallel |
| `pnpm dev:api` | API only |
| `pnpm dev:web` | Frontend only |
| `pnpm typecheck` | TypeScript across the workspace — currently clean |
| `pnpm test` | Test suite (Vitest + Supertest) — 644 tests in 48 files |
| `pnpm test:e2e` | Playwright RBAC, dashboard and case-lifecycle browser suite (e2e/) — 53 tests |
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
- Vite binds `127.0.0.1` and reads `VITE_PORT`/`PORT`. Set `VITE_HOST=0.0.0.0`
  (and `API_HOST` for the API) only when you deliberately need network access,
  e.g. in a cloud IDE.
- Sign-in uses server-side sessions: passwords are stored as scrypt hashes,
  the session is an HttpOnly cookie (8-hour idle / 7-day absolute limits,
  configurable — see `.env.example`), every API route requires it, repeated
  failed logins are throttled, and cross-origin writes are refused. This is a
  sound local prototype, not production security — see CLAUDE_HANDOFF.md §6.6.
- On first start after upgrading, an older `store.json` is migrated in place
  after a verified backup to `artifacts/api-server/data/backups/`.
- Roles and permissions are defined in `lib/access`, enforced by the API and
  reflected by the web app: each employee sees only the sidebar entries,
  tabs, sections and buttons their role allows, and a forbidden URL shows a
  "no access" page. Record owners are employees by id and change through the
  Reassign control.
