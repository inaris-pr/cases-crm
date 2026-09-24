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
│  ├─ cases/         React 19 + Vite 5 frontend   (~14k lines)
│  └─ api-server/    Express 5 API + in-memory store (~3.3k lines)
└─ lib/
   ├─ db/               Drizzle/Postgres schema — STALE, not wired up
   ├─ api-spec/         OpenAPI 3.1 — STALE, pre-Account model
   └─ api-client-react/ Orval target — never generated, exports nothing
```

Main navigation: Dashboard, Leads, **Records** (Accounts | Clients | Cases),
Accounting, Insights, Settings. Automations live **inside each case**
(Case Detail → Automations); they are managed, **never executed**.

## Commands

Run from `cases-app/`. Requires Node ≥20 and pnpm 9.0.0 (`corepack prepare pnpm@9.0.0 --activate`).

| Command | What it does |
|---|---|
| `pnpm dev` | API on :3001 + Vite on :5173, in parallel |
| `pnpm dev:api` | API only |
| `pnpm dev:web` | Frontend only (proxies /api to :3001) |
| `pnpm typecheck` | tsc --noEmit across the workspace (API src + tests, web, lib/db, lib/access) — **must stay clean** |
| `pnpm test` | Vitest + Supertest suite (34 files, 432 tests) — **must stay green** |
| `pnpm build` | esbuild bundle for the API, `tsc -b && vite build` for the web |
| `pnpm api:generate` | Orval regen from the OpenAPI spec — **do not run**; the spec is stale |

Log in with `iris@example.com` / `test123` (System Owner). Every employee —
including the demo employees for each role (`nadia@`, `leo@`, `grace@`,
`omar@`, `rachel@`, `tessa@`) — uses `test123`, stored only as a scrypt hash.
The login page lists them in development builds only.

`node_modules` is platform-specific. If it was installed on macOS, Vitest and
Vite cannot run from a Linux sandbox (darwin esbuild binary), though `tsc`
still can. Don't reinstall over the user's install to work around that.

## Data and how not to lose it

`artifacts/api-server/data/store.json` is the live database. The server rewrites
it, debounced, after every successful non-GET request.

- It is **git-ignored**. `store.snapshot.json` beside it is a committed restore
  point (it predates automations — restoring it gives none).
- Deleting `store.json` is safe and re-runs the seed in `store.ts`.
- **Never** edit `store.json` by hand while the API is running; the next write
  overwrites you.
- Two guards in `loadFromDisk()` force a re-seed for pre-Account files. If you
  add or rename a field on `Account`, add a guard.
- **Schema changes to existing records go through `src/migrations.ts`**: bump
  `CURRENT_SCHEMA_VERSION`, add an idempotent step, add tests. On startup an
  out-of-date `store.json` is backed up to `data/backups/` (exclusive create,
  SHA-256 verified), migrated in memory and written atomically; any failure
  stops startup with the file untouched. A `store.json` that cannot be parsed
  also stops startup — it is never replaced by the seed.
- If you add a **collection**, add it to `COLLECTION_SEQ` in `store.ts`.
  `normalizeLoaded()` then back-fills it (and its id counter) for older files
  instead of producing `NaN` ids. `test/migration.test.ts` covers this.

## Conventions that already exist — follow them, don't reinvent

- **Account ids and Contact ids are different sequences.** Build record
  links with `lib/caseLinks.ts` (`accountDetailPath`, `clientDetailPath`,
  `caseAccountLink`, `caseClientLink`, `accountCardLinks`). Never use
  `customer.id` or a `/api/customers` row's `id` as a Contact id — it is the
  Account id. A case's client is `primaryContactId`; `primaryContact` in API
  responses may be a stand-in (CLAUDE_HANDOFF.md §6.2).
- **Records routing** comes from `lib/records.ts`. Link to lists with
  `recordsPath("accounts" | "clients" | "cases")`, never a hard-coded
  `/accounts` etc. (those are redirects now). Detail URLs are
  `/accounts/:id`, `/clients/:id`, `/cases/:id`.
- **New cases** go through `components/cases/NewCaseDrawer.tsx` with a
  `context` (`global` | `account` | `client`). Don't add another form.
- **Case ↔ Account ↔ Contact rules are enforced on the server** in both
  `POST` and `PATCH /api/cases`. A primary contact must exist and be actively
  linked to the case's account. Don't rely on the UI for this.
- **Identity comes only from the server session** (Phase 1). Login sets an
  HttpOnly `cases_session` cookie; `authenticate` resolves it on every `/api`
  route except login/logout and puts the employee on `req.auth`. Use
  `currentUser(req)` / `requireAuth(req)` in routes. The `X-User` header is
  ignored, and body fields such as `authorName` / `byName` / `senderName` are
  accepted but ignored — never add a route that trusts a name from the client.
- **Sign-in always lands on the Dashboard** (`lib/session.ts`): sign-in
  clears the query cache and replaces the URL with `/` before setting the
  user; sign-out/401 clears the cache and replaces the URL with `/`; a reload
  with a live session keeps the page. Never add a "return to" destination.
- **Authentication ≠ authorization.** Every signed-in employee can still use
  every endpoint; enforcement is Phase 3 of the RBAC plan
  (`role-based-access-plan.md`, Revision 1, in the Project).
- **`lib/access` is the single source of access rules** (Phase 2): role keys,
  the permission catalog, own/team/all scopes, role bundles, Account field
  groups with sensitive-read rules, Settings/Insights permissions, the
  resolver (`resolvePermissions`, `can`, `scopeOf`) and navigation/route
  metadata. The API imports it through `src/access.ts` (a relative re-export,
  so esbuild bundles it); the web app imports **types only** via the
  `@cases/access` tsconfig path (a Vite alias comes with Phase 5).
  `GET /api/auth/me` returns `{ user, teams, permissions }`. Never define a
  role list or permission name anywhere else. Access changes must update
  `test/access-matrix.test.ts` — the approved matrix, cell by cell.
- **Security settings are named and validated** in `src/config.ts`
  (session idle/absolute timeouts, login throttling, API bind address, cookie
  `Secure` mode, trusted frontend origins, extra CORS origins). Don't
  hard-code such numbers elsewhere.
- **The browser reaches the API through Vite's proxy**, which rewrites `Host`
  (`changeOrigin: true`). The same-origin (CSRF) check therefore accepts the
  exact origins in `TRUSTED_FRONTEND_ORIGINS`, and never `X-Forwarded-*`.
  `origin-proxy.test.ts` replays Vite's proxy behaviour — keep it in step with
  `artifacts/cases/vite.config.ts`.
- **Validation** is Zod at every route boundary. Thrown `ZodError`s become
  `400 {error: "validation_error", issues}` via the handler in `index.ts`.
  Domain rejections are `400 {error: "<snake_case_code>"}` (409 for automation
  state conflicts).
- **All state is arrays in `store.ts`.** Routes do `.find` / `.filter` /
  `.push`. Do not introduce a query builder or an ORM into the API server.
- **Automations:** a global is one row, offered to every case by a union at
  read time — never materialize per-case copies. Customizing forks; reverting
  deletes the fork. Nothing executes automations; don't imply otherwise in UI
  copy or docs.
- **Frontend data** is TanStack Query against the hand-written typed client in
  `artifacts/cases/src/lib/api.ts`. Keys in use include `["cases"]`,
  `["case", id]`, `["case-thread", id]`, `["case-contacts", id]`,
  `["case-automations", caseId]`, `["automation", id]`,
  `["automation-usage", id]`, `["accounts"]`, `["account", id]`,
  `["contacts"]`, `["contact", id]`, `["clients"]`, `["customers"]`,
  `["mentions"]`, `["stats"]`, `["team"]`. Mutations invalidate by key —
  match the existing invalidation sets.
- **Pure logic modules** (`lib/records.ts`, `lib/caseLinks.ts`,
  `lib/caseSort.ts`) import nothing, so the API test suite can import and test
  them under Node. Keep new testable UI logic in that shape.
- **Routing** is Wouter, not React Router. **Icons** are Lucide. **Charts** are
  Recharts. **Animation** is Framer Motion. **Styling** is Tailwind v4 (beta)
  with CSS custom properties in `styles.css`; use `var(--color-primary)` etc.
  rather than hard-coded hex.
- Types are duplicated by design between `api-server/src/store.ts` and
  `cases/src/lib/api.ts`. Change one, change the other in the same commit.

## Tests

`pnpm test` from the root, or `pnpm --filter @cases/api-server test`.
Vitest + Supertest, in `artifacts/api-server/test/` — 34 files, 432 tests.

- **Every request needs a session.** `test/helpers/app.ts` logs in through the
  real endpoint: `asMe` is Iris's session cookie, `loginAs(email)` returns
  another employee's, and `authedRequest(app, headers?)` is `request(app)` with
  a cookie on every call — feature tests import it as `request`. Tests of
  authentication itself use plain `supertest`. Tests that change a user or
  revoke sessions use a demo employee, never Iris.

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
  12 documents, 8 leads, 1 global automation and **zero** conversations).
  Change the seed and these fail by design; update them deliberately.
- Tests that rely on distinct ids use seed records whose Account and Contact
  ids differ (e.g. account #6 / contact #4) — keep it that way, or an id swap
  can pass unnoticed.
- Anything comparing against `os.tmpdir()` must compare `fs.realpathSync()` of
  both sides — macOS resolves `/var` to `/private/var`.
- Some tests pin behaviour that is wrong but real — the duplicate-DM test, the
  stand-in contact. They say so in a comment. Don't "fix" production to make a
  test read better; change the test when you change the behaviour on purpose.
- **A test must never mutate shared seed state that later tests read.** All
  tests in a file share one seeded store, in declaration order. Create your
  own fixtures (`createGlobal()` in `automations.test.ts`,
  `isolatedAccount()` in `case-update-validation.test.ts`). A state the API
  can no longer produce (e.g. a dangling `primaryContactId`) may be set up by
  importing `store` from `../src/store` — that store is the file's isolated
  copy.
- React components are **not** tested. Only the pure `lib/` modules above are.

## Guardrails

Do not, without being asked:

- Weaken authentication: every `/api` route except login/logout must stay
  behind `authenticate` (`auth-sessions.test.ts` enumerates the routes in
  `routes.ts` and fails if one answers without a session).
- Delete the legacy `Customer` shim (`/api/customers`, the synthesized
  `customer` object, `customerId`) or change the stand-in `primaryContact`
  fallback in `caseWithRelations()`. The Board, the global New Case form, and
  several "Customer" columns still depend on them.
- Delete `pages/Customers.tsx`, `pages/Contacts.tsx`, `pages/ClientPortfolio.tsx`.
  They are unrouted and dead, but their removal is a tracked decision.
- Consolidate `pages/CaseDetail.tsx` with `components/CaseDetailModal.tsx`,
  `MessagesWidget.tsx` with `pages/Messages.tsx`, or the Board's
  `NewCaseModalForClient` with `NewCaseDrawer`.
- Wire up `lib/db`, run migrations, or introduce Postgres.
- Add AI/LLM functionality, an Accounting backend, an **automation execution
  engine**, or a Settings backend.
- Upgrade dependencies. Tailwind is on a v4 **beta** and esbuild is pinned to
  0.21.5 by a root override for a reason.

## Before you call something done

1. `pnpm typecheck` is clean.
2. `pnpm build` succeeds.
3. The flow you touched actually runs — boot the API and exercise it, don't
   infer from types.
4. `store.json` is intact (`git status` should not show it; it is ignored).
5. `pnpm test` is green. UI changes still need a browser.
6. CLAUDE_HANDOFF.md, README.md and CHANGELOG.md still describe reality.
