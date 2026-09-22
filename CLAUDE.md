# CLAUDE.md

Working instructions for Claude sessions in this repository.
For *what exists and why*, read **CLAUDE_HANDOFF.md** first — it is the state
of the project. This file is about *how to work here*.

---

## What this is

**CASES.** — a dark-mode case-management / CRM platform for a U.S. entity
formation business (LLC filings, registered agents, EINs, FinCEN BOI, renewals).
pnpm monorepo, TypeScript end to end.

```
cases-app/
├─ artifacts/
│  ├─ cases/         React 19 + Vite 5 frontend   (~12k lines)
│  └─ api-server/    Express 5 API + in-memory store (~2.7k lines)
└─ lib/
   ├─ db/               Drizzle/Postgres schema — STALE, not wired up
   ├─ api-spec/         OpenAPI 3.1 — STALE, documents ~25% of the real API
   └─ api-client-react/ Orval target — never generated, exports {}
```

## Commands

Run from `cases-app/`. Requires Node ≥20 and pnpm 9.0.0 (`corepack prepare pnpm@9.0.0 --activate`).

| Command | What it does |
|---|---|
| `pnpm dev` | API on :3001 + Vite on :5173, in parallel |
| `pnpm dev:api` | API only |
| `pnpm dev:web` | Frontend only (proxies /api to :3001) |
| `pnpm typecheck` | tsc --noEmit across the workspace — **must stay clean** |
| `pnpm test` | Vitest + Supertest suite for the API — **must stay green** |
| `pnpm build` | esbuild bundle for the API, `tsc -b && vite build` for the web |
| `pnpm api:generate` | Orval regen from the OpenAPI spec — **do not run** until the spec is refreshed; it would generate a client for the stale contract |

Log in with `iris@example.com` / `test123` (also `devon@`, `sara@`).

## Data and how not to lose it

`artifacts/api-server/data/store.json` is the live database. The server rewrites
it, debounced, after every successful non-GET request.

- It is **git-ignored**. `store.snapshot.json` beside it is a committed restore
  point — copy it over `store.json` and restart to reset.
- Deleting `store.json` is safe and re-runs the seed in `store.ts`.
- **Never** edit `store.json` by hand while the API is running; the next write
  overwrites you.
- Two guards in `loadFromDisk()` force a re-seed when the file predates a
  schema change. If you add or rename a field on `Account`, add a guard.

## Conventions that already exist — follow them, don't reinvent

- **Identity** travels two ways and both are load-bearing: an `X-User` header
  set by `fetchJson` in `lib/api.ts`, *and* explicit `authorName` / `byName` /
  `senderName` fields in request bodies for thread entries, interactions and
  messages. Sending only the header will fail Zod validation. (Unifying these
  is listed as debt — don't do it opportunistically.)
- **Validation** is Zod at every route boundary. Thrown `ZodError`s become
  `400 {error: "validation_error", issues}` via the handler in `index.ts`.
- **All state is arrays in `store.ts`.** Routes do `.find` / `.filter` /
  `.push`. Do not introduce a query builder or an ORM into the API server.
- **Frontend data** is TanStack Query against the hand-written typed client in
  `artifacts/cases/src/lib/api.ts`. Query keys are `["cases"]`, `["case", id]`,
  `["case-thread", id]`, `["accounts"]`, `["mentions"]`, `["stats"]`, `["team"]`.
  Mutations invalidate by key — match the existing invalidation sets.
- **Routing** is Wouter, not React Router. **Icons** are Lucide. **Charts** are
  Recharts. **Animation** is Framer Motion. **Styling** is Tailwind v4 (beta)
  with CSS custom properties in `styles.css`; use `var(--color-primary)` etc.
  rather than hard-coded hex.
- Types are duplicated by design between `api-server/src/store.ts` and
  `cases/src/lib/api.ts`. Change one, change the other in the same commit.

## Tests

`pnpm test` from the root, or `pnpm --filter @cases/api-server test`.
Vitest + Supertest, in `artifacts/api-server/test/`. API only.

- **Isolation is the important part.** `test/setup.ts` chdirs into a fresh
  temp directory before anything imports the store, so the suite can never
  read or write `artifacts/api-server/data/store.json`. The pool is `forks`
  (not `threads`) because `process.chdir()` throws in worker threads, and a
  process per file also re-runs the module-level `seed()` so every file starts
  from identical data. `test/isolation.test.ts` asserts all of this rather
  than trusting it — **do not weaken those tests.**
- `test/helpers/app.ts` assembles the app the way `src/index.ts` does, minus
  pino-http and `listen()`. Its error handler is a copy of the one in
  `index.ts` — **change one, change the other.**
- Tests assert seed counts (17 accounts, 21 contacts, 15 cases, 65 tasks,
  12 documents, 8 leads, and **zero** conversations). Change the seed and these
  fail by design; update them deliberately.
- Anything comparing against `os.tmpdir()` must compare `fs.realpathSync()` of
  both sides — macOS resolves `/var` to `/private/var`, so raw string
  comparison passes on Linux and fails on a Mac.
- Some tests pin behaviour that is wrong but real — the duplicate-DM test, for
  instance. They say so in a comment. Don't "fix" production to make a test
  read better; change the test when you change the behaviour on purpose.

## Guardrails

Do not, without being asked:

- Delete the legacy `Customer` shim (`/api/customers`, the synthesized
  `customer` object, `customerId`). The Kanban board and the New Case drawer
  still depend on it.
- Delete `pages/Customers.tsx`, `pages/Contacts.tsx`, `pages/ClientPortfolio.tsx`.
  They are unrouted and dead, but their removal is a tracked decision.
- Consolidate `pages/CaseDetail.tsx` with `components/CaseDetailModal.tsx`, or
  `MessagesWidget.tsx` with `pages/Messages.tsx`.
- Wire up `lib/db`, run migrations, or introduce Postgres.
- Add AI/LLM functionality, an Accounting backend, an Automations execution
  engine, or a Settings backend.
- Upgrade dependencies. Tailwind is on a v4 **beta** and esbuild is pinned to
  0.21.5 by a root override for a reason.

## Before you call something done

1. `pnpm typecheck` is clean.
2. `pnpm build` succeeds.
3. The flow you touched actually runs — boot the API and exercise it, don't
   infer from types.
4. `store.json` is intact (`git status` should not show it; it is ignored).
5. `pnpm test` is green. The suite covers the API only — **nothing tests the
   frontend**, so UI changes still need a browser.
