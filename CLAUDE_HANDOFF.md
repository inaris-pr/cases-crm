# CLAUDE_HANDOFF.md

**Purpose:** everything a new session needs to resume work without
re-discovering the repository. If you change the architecture, update this
file in the same change.

**Updated — 2026-09-25, Phase 8B (Knowledge Base UI).** Built on `598a0ec`
("Phase 8A follow-up: shared/national services vs jurisdiction content", =
`origin/main`, CI green per the owner). Default branch `main`; private remote
`inaris-pr/cases-crm`.

| Gate | Baseline |
|---|---|
| `pnpm typecheck` | clean (api-server src + tests, web, lib/access, lib/db) |
| `pnpm test` | **778 tests in 54 files**, all passing (Vitest + Supertest) |
| `pnpm test:e2e` | **67 Playwright tests in 5 spec files** (13 new in `knowledge.spec.ts`) |
| GitHub Actions | green at `598a0ec` (owner-confirmed). Jobs: Node 20 and Node 22 typecheck + test, Playwright browser suite |

**Status:** RBAC Phases 1–6 and Phase 7 (case lifecycle, categories,
escalations — with its follow-ups: Category on the Board's New Case popup,
the unified newest-first Case Thread) are complete. **Phase 8 — Knowledge
Base foundation** is implemented (backend/content only: canonical article
model, five LLC pilot articles, read API; §2 Knowledge Base), plus the
**8A follow-up**: explicit shared/national service rules with provenance,
and direct vs inherited vs effective service metadata, and **Phase 8B —
Knowledge Base UI** (read-only `/knowledge` and `/knowledge/:slug`; §2
Knowledge Base UI). **No Case recommendations or Knowledge Assistant exist
yet; articles are not editable.** Automations
can be configured but are **never executed**.

---

## 0. Start here

**CASES.** is an internal case/customer operations CRM for a U.S. entity
formation business (LLC filings, registered agents, EIN, compliance). It
covers:

- sign-in with server sessions, and role-based access control (RBAC)
- **Records**: Accounts (companies), Clients (people), Cases
- **Leads** with conversion into Account + Client (+ optional first Case)
- **Cases**: status, priority, category, owner, escalations, tasks,
  documents, call/contact logs, comments, automations (configuration only)
  and a unified **Thread** timeline
- **Messages** (DMs/groups, case tags, @mentions)
- **Knowledge Base** (Phase 8/8B): one internal article per jurisdiction per
  entity type; five LLC pilot articles; read-only search and reader UI
- permission-composed **Dashboards** per role
- **Insights** (case analytics), **Accounting** (prototype data only),
  **Settings** (mostly prototype; access-gated)

**Where the rules live (sources of truth):**

| Concern | Module |
|---|---|
| Roles, permissions, scopes, role bundles, Account field groups, navigation/route access, per-record controls, dashboard section/widget rules | `lib/access/src/*` (`@cases/access`) — shared by API and web |
| Route guards, principal, own/team/all scope checks | `artifacts/api-server/src/auth/authorize.ts` |
| Sessions, passwords, login throttling, same-origin check | `artifacts/api-server/src/auth/*`, `src/config.ts` |
| Every API route | `artifacts/api-server/src/routes.ts` |
| Data model, seed, load/normalize/persist | `artifacts/api-server/src/store.ts` |
| Versioned store migrations (v1 identity, v2 ownership ids) | `artifacts/api-server/src/migrations.ts` |
| Dashboards | `src/dashboard.ts` + `lib/access/src/dashboard.ts` |
| Case categories, escalation reasons, terminal status | `src/caseMeta.ts` (web mirror `cases/src/lib/caseMeta.ts`) |
| Case status history, closedAt, resolution, escalations | `src/caseLifecycle.ts` |
| Derived "last activity" | `src/caseActivity.ts` |
| Case Thread feed | `src/caseFeed.ts` (web: `components/cases/CaseFeed.tsx`) |
| Knowledge Base model, validation, content, repository, read API | `artifacts/api-server/src/knowledge/*` (content is source-controlled, not in `store.json`) |
| Knowledge Base UI (pages, presentation rules) | `cases/src/pages/Knowledge*.tsx`, `cases/src/lib/knowledge.ts` |
| Web routing / Records tabs / session landing | `cases/src/App.tsx`, `lib/records.ts`, `lib/session.ts` |
| Web API types (duplicated by design) | `cases/src/lib/api.ts` |

> ⚠️ **BEFORE ANY FUTURE STORE MIGRATION: stop `pnpm dev` first.**
> `pnpm dev` runs the API with `tsx watch`, which restarts the server on
> every saved source file, and startup migrates `store.json` if it is behind
> `CURRENT_SCHEMA_VERSION`. In RBAC Phase 4 the running dev server
> hot-reloaded the new v2 migration code and migrated the live store before
> the migration had been reviewed, dry-run or committed (the backup was
> verified and the result was correct, but the timing was not under
> anyone's control). So: stop `pnpm dev`, write and test the migration
> against isolated temp stores, get approval, then run it deliberately.
> Prefer additive, nullable fields that `normalizeLoaded()` can fill in
> memory — Phase 7 needed no migration at all.

> **Automations do not execute.** The builder saves graphs; the Run button
> only animates edges. Nothing evaluates triggers or performs actions, and
> no "Automation ran" Thread entry is ever produced.

---

## 1. How the project got here

Development happened on a **Windows** machine between 2026-05-13 and
2026-05-14, then stopped. The folder was moved to a **Mac**
(`~/Desktop/APPS/CRM/cases-app`) and picked up again on 2026-09-22.

It had **never been under version control**. The recovery commit `fe6e6e8`
is the working tree exactly as found; nothing before it is recoverable.

Work had stopped **mid-migration** from a flat `Customer` record to
`Account` + `Contact` + `AccountContactLink` + `Lead`. The new model is live;
the old one is still present as a compatibility layer (§6.1).

Since recovery (2026-09-22 → 2026-09-25, see CHANGELOG.md):

| Commits | Work |
|---|---|
| `fe6e6e8`–`98ae4a3` | Recovery: Git, macOS reinstall, 4 blocking defects fixed, docs |
| `b336b40` | Vitest + Supertest API suite |
| `f0a8745`–`9154b0a` | Case Automations — management only (§3.1) |
| `b73d9f4` | Contextual case creation from Account and Client pages (§3.2) |
| `d5c6f86` | Consolidated Records workspace (§3.3) |
| `979a6f7`–`2e07101` | Link corrections, case-edit validation, table sorting (§3.4) |
| `5f78e5e` | GitHub Actions CI (typecheck + tests on push/PR to `main`) |
| RBAC Phase 1 | Identity foundation: hashed passwords, sessions, auth on every route, roles/teams stored, store migration (§2 Authentication) |
| RBAC Phase 2 | Permission core: `lib/access` (catalog, scopes, bundles, Account field rules, navigation metadata); `/api/auth/me` reports permissions (§2 Permissions) |
| Login landing fix | Every sign-in lands on the Dashboard; sign-out leaves the protected URL (`cases/src/lib/session.ts`) |
| RBAC Phase 3 | Backend enforcement: a guard on every route, record scope, Account redaction and field groups, case/lead response shaping, private messages and mentions (§2 Enforcement) |
| RBAC Phase 4 | Stable owner/author ids (store v2 migration), real team scope from stored teams, reassignment endpoints (§2 Ownership) |
| RBAC Phase 5 | Role-aware frontend: sidebar, Records tabs, route guard, section and control gating, reassign UI, interim Dashboard; Playwright RBAC suite in CI (§2 Frontend access) |
| RBAC Phase 6 | Personalized role dashboards: `GET /api/dashboard` with permission-gated, scope-computed sections; widget registry by permission; derived case last activity (§2 Dashboards) |
| Phase 7 | Case categories, status history with real closedAt / reopen, resolution time, manual escalations with history; filters and dashboard integration; no migration (§2 Case lifecycle) |
| Phase 7 follow-ups | Category on the Board's New Case popup; the Case Thread as a unified timeline of comments + system activity (§2 Case Thread) |
| `980fa23` | Checkpoint: handoff/docs synchronized after Phase 7 |
| Phase 8 | Knowledge Base foundation: canonical article model, validation, five source-controlled LLC pilot articles (AZ, CA, DE, FL, WY), read-only API under `knowledge.view`; no UI (§2 Knowledge Base) |
| Phase 8A follow-up | Shared/national service rules with provenance; direct vs inherited vs effective service availability; unresolved source discrepancies (§2 Knowledge Base) |
| Phase 8B | Knowledge Base UI: sidebar Knowledge, `/knowledge` search/filters, `/knowledge/:slug` reader with flagged sections, shared-service / discrepancy / not-offered panels; read-only (§2 Knowledge Base UI) |

---

## 2. Architecture

pnpm workspace (`artifacts/*`, `lib/*`), TypeScript throughout, ~25k lines
of source (web ~16.7k, API ~7.2k, lib/access ~1.2k) plus ~9.2k lines of
API tests. pnpm 9.0.0, Node ≥ 20.

```
cases-app/
├─ artifacts/
│  ├─ cases/         React 19, Vite 5, Tailwind v4-beta, Framer Motion,
│  │                 Wouter, TanStack Query v5, Recharts, Lucide
│  └─ api-server/    Node 20+, Express 5, Zod, Pino; tsx in dev, esbuild to build
├─ lib/
│  ├─ access/           @cases/access: roles, permissions, scopes, navigation,
│  │                    controls, dashboard rules (pure TS, no deps; used by
│  │                    the API via src/access.ts and by the web via a Vite
│  │                    alias + tsconfig path)
│  ├─ db/               Drizzle + postgres-js      (stale, unused)
│  ├─ api-spec/         OpenAPI 3.1 YAML           (stale)
│  └─ api-client-react/ Orval target               (never generated)
├─ e2e/                 Playwright suite (outside the pnpm workspace;
│                       npm + e2e/package-lock.json)
└─ .github/workflows/ci.yml   CI: typecheck + test (Node 20, 22) and e2e
```

Web routing is **Wouter** (`App.tsx`); data is **TanStack Query** over the
hand-written client in `cases/src/lib/api.ts`. The API is one Express router
(`buildApiRouter()` in `routes.ts`) mounted at `/api`.

### Persistence

There is **no database**. `api-server/src/store.ts` holds **nineteen**
in-memory arrays (including `teams`, `sessions` and the Phase 7
`caseStatusEvents`, `caseEscalations`, `caseActivities`), a
`meta.schemaVersion` (**2**) and an id-sequence object. A router-level hook persists the
whole store to `artifacts/api-server/data/store.json` (debounced 100 ms)
after every successful non-GET request.

On boot, `loadFromDisk()` rehydrates from that file unless one of two schema
guards fires (legacy `customers` array; accounts without `portalId`), in which
case the demo seed runs instead. After hydrating it calls
**`normalizeLoaded()`**, which makes an older file safe to write to: any
collection missing from the file (e.g. `automations` in a pre-automation
store) becomes `[]`, and any missing, non-numeric or too-low `seq` counter is
repaired from the highest id present (and `caseNumber` from the highest
`CASE-nnn`). It never drops or rewrites existing records. Adding a collection
means adding one line to `COLLECTION_SEQ`. It also fills Phase 7 / Thread
fields that older files lack, **in memory only** (the file changes on the
next ordinary save): Case `category`/`closedAt`/`closedBy*` → `null`; Task
`createdBy*`/`completed*` → `null` and `createdTitle` → the title as first
loaded; Document `uploadedBy*` → `null`. Nothing historical is inferred
(no `closedAt` from `updatedAt`, no invented actors).

**Versioned migrations** (`src/migrations.ts`, from RBAC Phase 1): the store
records `meta.schemaVersion` (currently 2). When `store.json` is behind,
startup first DRY-RUNS the pending steps on a copy (a failing step stops
startup before anything is backed up or written), then copies it byte-for-byte to
`data/backups/store.pre-v<N>.from-v<M>.<timestamp>.json` (exclusive create,
never overwriting), re-reads the copy and compares SHA-256 with the source,
checks the source did not change meanwhile, runs the ordered idempotent steps
in memory, and writes the result atomically (temp file + rename). Any failure
throws `MigrationAbortError` and startup stops with `store.json` untouched. A
`store.json` that exists but is not valid JSON also stops startup rather than
being replaced by the seed. Step v1 (identity foundation) hashes passwords,
maps legacy roles, adds user flags, and adds the demo employees and teams.
Step v2 (ownership ids, Phase 4) adds the id next to every employee display
name listed in `OWNERSHIP_FIELDS` by exact name match, and refuses the
whole migration if any name matches no employee or more than one. Phase 7
and its follow-ups added only optional fields and collections, so the
schema is still **v2** — see the migration warning in §0. The live store
`artifacts/api-server/data/store.json` (and `data/backups/`) is
**git-ignored**; `store.snapshot.json` is committed.

Seed contents (verified by running `seed()`): 17 accounts, 21 contacts,
23 account–contact links, 8 leads, 15 cases, 65 tasks, 12 documents,
15 interactions, 14 thread entries, **9 employees** (Iris, Devon, Sara + 6 demo
employees), **3 demo teams**, **1 global automation** ("High-priority intake
routing"), and **no conversations, messages, mentions or sessions**. All
fictional.

`store.snapshot.json` (committed) is a restore point of the data as recovered
on 2026-09-22. It **predates automations**: restoring it gives zero
automations (normalizeLoaded adds the empty collection; the seed does not run).

### Authentication (RBAC Phase 1)

- **Employees** (`User`): `roles[]` (keys from the architecture plan: `csr`,
  `csr_supervisor`, `business_advisor`, `business_advisor_supervisor`,
  `operations_admin`, `operations_admin_supervisor`, `hr`, `system_owner`,
  and reserved `filing`, `filing_supervisor`, `partner`), `departmentKey`,
  `active`, `demo`, `passwordHash`, `mustChangePassword`, `lastLoginAt`.
  Iris = `system_owner`; Devon, Sara = `csr`; demo employees Nadia
  (`csr_supervisor`), Leo (`business_advisor`), Grace
  (`business_advisor_supervisor`), Omar (`operations_admin`), Rachel
  (`operations_admin_supervisor`), Tessa (`hr`). All use `test123`.
- **Teams** (`Team`): Customer Service (Devon, Sara; supervisor Nadia),
  Business Advisors (Leo; Grace), Operations (Omar; Rachel). Team scope
  reads them live on every request (§ Enforcement). Employees can hold
  several roles; permissions are their union (widest scope wins).
- **Passwords**: scrypt via Node's `crypto` (unique 16-byte salt, constant-time
  comparison; `src/auth/password.ts`). Never returned by any endpoint.
- **Sessions** (`src/auth/sessions.ts`): random 256-bit token in an
  HttpOnly, SameSite=Lax cookie `cases_session` (Path `/api`; `Secure` over
  HTTPS); only its SHA-256 is stored. Ends after 8 h idle or 7 days, on
  logout, or when the employee is deactivated.
- **Endpoints**: `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me` (`{ user, teams, permissions, supervisedUserIds }`).
- **Every other `/api` route requires a session** (`401 unauthenticated`).
  Identity comes only from the session; `X-User` and body names
  (`authorName`, `byName`, `senderName`) are ignored.
- **Throttling**: 5 failed logins per email / 20 per IP in 15 minutes → `429`.
- **Network**: same-origin only (no CORS headers unless
  `CORS_ALLOWED_ORIGINS`), API bound to `127.0.0.1`, Vite bound to
  `127.0.0.1` and proxying to it. A non-GET request whose `Origin` (or
  `Referer`) is neither the API's own host nor listed exactly in
  `TRUSTED_FRONTEND_ORIGINS` (default `http://127.0.0.1:5173`,
  `http://localhost:5173`) or `CORS_ALLOWED_ORIGINS` → `403`. The trusted list
  is needed because Vite's proxy (`changeOrigin: true`) rewrites `Host` to the
  API's address; `X-Forwarded-*` headers are never trusted.
- **Frontend**: `AuthProvider` asks `/api/auth/me`; nothing identity-related
  is kept in `localStorage`; any `401` returns to the login screen; logout
  ends the server session and clears cached data.
- Roles are enforced by the API (Phase 3) and reflected by the web app
  (Phase 5). **Permissions and scopes are authoritative, never role names**:
  code asks `can(permissions, "cases.edit")` / `canOn(p, perm, ownerUserId)`,
  not "is this a CSR".

### Permissions (RBAC Phase 2)

`lib/access` (`@cases/access`) is pure TypeScript with no runtime
dependencies, and is the only place access rules live:

- `roles.ts` — final role keys and labels (`operations_admin` = "Admin"),
  reserved roles (`filing`, `filing_supervisor`, `partner`: zero permissions),
  department keys.
- `permissions.ts` — the catalog: each permission is *scoped* (granted as
  `own` | `team` | `all`) or *unscoped* (`true`). Includes the split Account
  edit groups, `accounts.view.regulatory_ids` / `accounts.view.financial`,
  domain Insights (`insights.cases|sales|people.view`), metrics, Accounting
  vs Payroll, operational `settings.*`, `people.*` and privileged `system.*`.
- `grants.ts` — role bundles exactly as in plan Revision 1 §R5; System Owner
  is computed as every permission at `all`.
- `resolve.ts` — `resolvePermissions(roles)` (union, widest scope wins,
  unknown roles ignored), `can`, `scopeOf`, `canAny`, `canGrantRole`,
  `sanitizeEffectivePermissions`.
- `accountFields.ts` — every `Account` field in one group (base, profile,
  service, formation, regulatory_ids, financial, system); read rules (EIN
  masked `**-***6789`, FinCEN ID `****6789`, Stripe/banking IDs, banking
  message and cart URL omitted); `redactAccount`, write rules
  (`forbiddenAccountFields`; `ownerName` → `accounts.assign`, `archived` →
  `accounts.archive`).
- `navigation.ts` — sidebar items, Records/Insights/Accounting/Settings
  sections (`live` vs `planned`; planned never shows an item), and
  `ROUTE_ACCESS` for every route in `App.tsx`.

- `controls.ts` — per-record UI controls from the same rules
  (`caseControls` incl. `escalate`/`resolveEscalation`, `leadControls`,
  `accountControls`, `clientControls`, `createActions`).
- `dashboard.ts` — `DASHBOARD_SECTION_REQUIREMENTS` and `DASHBOARD_WIDGETS`.

The API re-exports it from `src/access.ts` (relative import, bundled by
esbuild); `/api/auth/me` adds `permissions`. The web app imports it at
runtime through a Vite alias (`@cases/access`, plus a tsconfig path) and
keeps `permissions` in `AuthProvider`. `test/access-matrix.test.ts` pins the
approved role × permission matrix cell by cell.

Active roles and their essentials (full matrix in `grants.ts`):

| Role | Essentials |
|---|---|
| `csr` | cases view/work all, edit own; accounts/clients view all; own case/call metrics |
| `csr_supervisor` | as CSR, plus cases edit/assign **team**, team metrics, Insights (cases, team), Divisions & teams |
| `business_advisor` | leads view/edit/convert own; accounts/clients view all; own sales metrics; **no cases** |
| `business_advisor_supervisor` | leads **team**, accounts assign team, team sales metrics; **no cases** |
| `operations_admin` | cases view/work all, edit own; account formation/regulatory fields; own metrics; **no leads** |
| `operations_admin_supervisor` | cases edit **all**, assign team, global automations, all case/call metrics, pipeline settings; **no leads** |
| `hr` | people view/manage, employee metrics & Insights (planned page), Payroll, Divisions view; **no customer, case or lead data** |
| `system_owner` | every permission at `all` |
| `filing`, `filing_supervisor`, `partner` | **reserved — zero permissions** ("No access has been set up for your role yet") |

### Enforcement (RBAC Phase 3)

`src/auth/authorize.ts`:
- **Guards** — every route's first handler is `publicRoute` (login, logout),
  `signedIn` (`/auth/me`) or `allow(...permissions)` (any of). Missing →
  `403 { error: "forbidden", permission }`. `test/route-guards.test.ts`
  walks the router (deny by default), compares every declaration with a
  reviewed table, and runs every route as every role.
- **Principal** — `principalOf(req)`: the session's employee, their
  effective permissions, and the ids of the members of every team they
  currently supervise (`supervisedMemberIds`, read from `store.teams`).
- **Scope** — `canOn(p, permission, ownerUserId)` / `rowsInScope`, by stable
  employee id only (Phase 4). own = records I own; team = own + records
  owned by members of teams I supervise (a deactivated member's records
  stay in scope so they can be reassigned; being a *member* gives nothing
  over teammates; department or role alone gives nothing); all =
  everything. A record without an owner id is reachable only with all.
- **Outcomes** — list routes filter; a record outside *view* scope is `404`;
  visible but outside the action's scope is `403 out_of_scope` (e.g. a CSR
  editing a colleague's case — they may still log calls/comments on it,
  `cases.work` is company-wide); field-level refusals are
  `403 { error: "forbidden_fields", fields }`, all or nothing.

In `routes.ts`:
- Accounts: `shapeAccount` redacts per R2.2 (EIN/FinCEN masked, Stripe/banking
  IDs, banking message and cart URL null, `redactedFields` listed) in
  `/accounts`, `/accounts/:id`, case embeds, client embeds and the
  conversion response. `POST`/`PATCH /accounts` check each field's group
  (`accountFieldWritePermissions`) in scope.
- Without `cases.view` no case data anywhere (no `cases`, `caseCount`,
  `openCaseCount`; message case tags filtered; mentions from unviewable
  cases left out). `/stats` needs `metrics.cases` and is clamped to its scope.
- Leads: `leads.view` own/team/all; conversion with a first Case needs
  `cases.create` or the whole request is refused (B4).
- **Reassignment** (Phase 4): `PUT /api/{cases|leads|accounts|contacts}/:id/owner`
  `{ ownerUserId }` (strict body — no names). Needs `<type>.assign`; record
  visible (else 404); current owner in assign scope (`403 out_of_scope`);
  target must exist (`400 unknown_user`), be active (`400 inactive_user`),
  hold `<type>.view` (`400 target_cannot_own`) and be in assign scope
  (`403 target_out_of_scope`). Sets `ownerUserId` and the `ownerName` label.
  `ownerName` in a PATCH → `400 owner_change_requires_reassign`.
- Case automations follow the case owner (`automations.edit`); globals need
  `automations.manage_global`.
- Messages: read/post/delete only as a member (`404` otherwise); a creator
  must be in the members; `/mentions` is your own inbox only.
- **Identity by id** (Phase 4): authors, callers, senders, mention
  recipients and conversation members are stored by id (plus the display
  name as written, never rewritten). Conversations are created from
  `memberUserIds` or exact active-employee names; `@mentions` resolve to
  active employees who may view the case; `/api/team` lists active
  employees; `/stats` and `/cases` accept `assigneeUserId` (a name
  filter is resolved to exactly one employee).
- **Not yet**: `mailingAddress` change auditing waits for an audit log;
  Account/Automation `createdByName`/`lastModifiedByName` stay name-only
  audit stamps.

### Ownership, teams and reassignment (RBAC Phase 4)

- Every owned record carries **`ownerUserId`** (cases, leads, accounts,
  contacts, automations) next to an `ownerName` display label. Authors and
  actors are ids too: `authorUserId`, `byUserId`, `senderUserId`,
  `fromUserId`/`toUserId`, `memberUserIds`, and the Phase 7 `*ByUserId`
  fields. **Permission logic never reads a display name.** Labels are kept
  as written at the time (history is never rewritten); `ownerName` follows
  the owner on reassignment.
- **Team scope** = the caller's own records + records owned by members of
  the teams the caller **currently supervises**, read from `store.teams` on
  every request (`supervisedMemberIds`). Being a member gives nothing over
  teammates; department or role alone gives nothing. A record with no owner
  id is reachable only with `all` scope.
- **Reassignment** only through `PUT /api/{type}/:id/owner { ownerUserId }`
  (needs `<type>.assign`; current owner and target inside the caller's
  assign scope; target must exist, be **active** and hold `<type>.view`).
  `GET /api/owners/{type}/candidates` lists valid targets (active employees
  only). The web uses `ReassignControl`.
- **Deactivated employees** (`active: false`): their sessions end at once,
  they cannot sign in, they are not offered as reassignment targets or
  @-mention recipients, but records they own stay theirs and stay inside
  their supervisor's team scope so they can be reassigned. There is no UI yet
  to deactivate or rename employees (no People module).

### Frontend access (RBAC Phase 5)

The web app renders only what the employee's permissions allow, from the
same lib/access rules the API enforces (`@cases/access`, a Vite alias):
- **Auth state**: `/auth/me` → `permissions` + `supervisedUserIds`;
  `useAccess()` gives the `AccessContext`. Permissions are set together
  with the user on sign-in (lib/session.ts), so nothing renders with a
  previous employee's navigation.
- **Gate** (`App.tsx`): roles with no navigation (Filing, Partner) get
  `NoRoleAccess`; every route is checked with `canOpenRoute` BEFORE its
  page mounts — refused routes show `NoAccess` and fetch nothing;
  `/records` opens the first permitted tab.
- **Sidebar** ← `visibleNavItems` (Messages entry; Knowledge — in-app since
  Phase 8B — for `knowledge.view`); the account chip opens `/account`
  (personal settings; API Keys only with `system.integrations.manage`).
- **Sections**: Records tabs, Accounting tabs (statements need
  `accounting.view`, Payroll `accounting.payroll.view`; still prototype
  data), Settings tabs (Invite users hidden until the People phase; Danger
  zone with `system.data.manage`; Divisions read-only without
  `settings.teams.manage`), Insights (only live domains).
- **Controls**: `caseControls` (edit, work, reassign, automations),
  `leadControls` (edit/convert/first-Case/reassign/delete), `accountControls`
  (per-field edit by group, archive, reassign, cases), `clientControls`,
  `createActions`. Redacted Account fields show "Restricted".
- **Reassign**: `ReassignControl` lists `GET /api/owners/:type/candidates`
  (active, can view that record type, inside the caller's assign scope)
  and sends `{ ownerUserId }`.
- **Dashboard**: replaced by the Phase 6 dashboards (below).
- **What each role sees** (pinned by `e2e/tests/rbac.spec.ts`):

  | Role | Sidebar | Records tabs |
  |---|---|---|
  | CSR, Operations Admin | Dashboard, Records, Messages, Knowledge | Accounts, Clients, Cases |
  | CSR Supervisor, Ops Admin Supervisor | Dashboard, Records, Insights, Messages, Knowledge, Settings | Accounts, Clients, Cases |
  | Business Advisor | Dashboard, Leads, Records, Messages, Knowledge | Accounts, Clients (never Cases) |
  | BA Supervisor | Dashboard, Leads, Records, Messages, Knowledge, Settings | Accounts, Clients |
  | HR | Dashboard, Messages, Knowledge, Accounting (Payroll only), Settings (Divisions) | none |
  | System Owner | everything | all three |
  | reserved roles | none — a No-access screen | — |

  Knowledge (Phase 8B) needs `knowledge.view`, which every operational role holds. Leads:
  Business Advisors, BA Supervisors, System Owner only. Settings: Danger zone
  and company settings are System Owner only; Invite users stays hidden
  until a People phase. Typing a forbidden URL (e.g. a CSR at `/leads`, HR at
  `/cases/1`) shows **No access** before the page mounts, so nothing is
  fetched. Sign-in always lands on the Dashboard and clears cached data, so
  a previous employee's navigation never shows.
- **Browser tests**: `e2e/` (Playwright, 67 tests, `pnpm test:e2e`) starts its
  own API (fresh temp store via `CASES_DATA_DIR`) and Vite on 3101/5174;
  CI job `e2e`. e2e/ is outside the pnpm workspace; `@playwright/test` is
  pinned exactly in `e2e/package.json` and locked by `e2e/package-lock.json`
  (installed with `npm ci`).

### Dashboards (RBAC Phase 6)

One Dashboard at `/` for every employee, composed by permission — never by
role name — so an employee with several roles sees the union.
- **API**: `GET /api/dashboard` (`allow("dashboard.view")`,
  `src/dashboard.ts`). Sections are included only when
  `DASHBOARD_SECTION_REQUIREMENTS` (lib/access `dashboard.ts`) hold, and
  computed at the scope of the section's metrics permission:

  | Section | Requires | Scope from | Contents |
  |---|---|---|---|
  | `cases` | metrics.cases + cases.view | metrics.cases | open/completed, open high+critical, open & overdue tasks, by status, open by priority, 30-day created trend, recent (by last activity), attention list, least recently worked, recent activity; `workload` per employee at team/all |
  | `calls` | metrics.calls + cases.view | metrics.calls (by who logged) | manual call/contact logs: 7/30 days, by channel, latest |
  | `leads` | metrics.sales + leads.view | metrics.sales | active/total, by current status, recent; `workload` per advisor at team/all |
  | `accounts` | metrics.sales + accounts.view | metrics.sales (by account owner) | owned accounts, clients linked to them (all scope: all clients), newest, by owner |
  | `people` | metrics.people + people.view | metrics.people | active/inactive employees, by department, by role, teams with supervisors and members — employees only |
  | `communication` | messages.use | own | unread mentions, latest mentions (same filter as `/api/mentions`), latest conversations |

  Team scope = the caller + members of the teams they supervise now
  (stable ids). Workload rows: team → those people; all → every active
  holder of the view permission plus any owner in scope (+ "No owner").
  **Tasks have no assignee**, so task counts are attributed to the owner of
  the task's Case. Overdue = not completed and `dueDate` before now.
- **Last activity** (`src/caseActivity.ts`): the latest of the Case's
  `createdAt`/`updatedAt`, its call/contact logs, comments, task creations
  and document uploads, with its source. Derived on read — never stored,
  `Case.updatedAt` untouched, existing sorts unchanged. Task completions
  (recorded since the Thread follow-up) and escalations are not part of this
  rule; `Case.updatedAt` also moves on reassignment and status changes.
- **Phase 7 additions**: escalated count, the Escalations widget (team/all
  also see recent escalation activity), open Cases by category at team/all
  scope, an Escalated column in workload, and escalations first in "Needs
  attention" (§2 Case lifecycle). Business Advisors and HR get none. No "stale" threshold — the
  actual age is shown.
- **Web**: `pages/Dashboard.tsx` renders `WIDGETS`
  (`components/dashboard/widgets.tsx`, presentational parts in `parts.tsx`)
  whose `DASHBOARD_WIDGETS` requirements hold — decided before fetching.
  One query (`["dashboard"]`, always refetched on mount). Loading →
  skeletons; failure → an error banner and per-widget errors with Retry,
  never zeros; empty lists say so; real zeros show as 0.
  Test ids: `dashboard`, `widget-<id>` (`data-state` loading/ready/error),
  `stat-*-value`, `workload-row-<userId>`, `lead-row-<userId>`,
  `team-<id>`, `dashboard-error`.
- **Widgets by role** (demo data): CSR / Operations Admin — case summary,
  attention, least recently worked, breakdown, recent cases, recent
  activity, trend, calls, mentions, conversations; CSR Supervisor /
  Operations Admin Supervisor — the same plus workload (team; the Admin
  Supervisor's `metrics.cases` is all-scope); Business Advisor — lead
  summary, leads by status, recent leads, accounts, mentions,
  conversations; BA Supervisor — the same plus leads by advisor; HR —
  people summary, employees by department/role, teams, mentions,
  conversations; System Owner — everything, company-wide.
- **Deferred metrics** (not shown; the data does not exist yet): revenue,
  commissions, goals/quotas, refunds, chargebacks, disputes, payments —
  need a billing/accounting backend; lead conversions over time and by
  advisor — need a conversion event recording who converted and when that
  survives lead deletion; aggregate resolution time / time to close —
  Phase 7 now records `closedAt` and status history for Cases closed from
  then on (Case Detail shows per-Case resolution), but no dashboard metric
  aggregates it yet; task assignment and workload by assignee — need a task
  `assigneeUserId` (tasks now record creator and current completion, but
  have no assignee);
  call volume, talk time, missed calls — need a phone-system integration
  (today's figures are manual logs only); first response time — needs
  inbound-message timestamps per case; filing errors — need an error
  category on cases/documents; employee performance ratings, tenure,
  headcount history — need HR records (hire/termination dates); leaderboard
  (`metrics.sales.leaderboard`) — needs reliable conversions.

### Case lifecycle, categories & escalations (Phase 7)

Category, priority and escalation are separate concepts; none is derived
from another and nothing is classified or escalated automatically.
- **Category** (`Case.category`, optional, `null` = uncategorized): one
  primary category from `src/caseMeta.ts` — `general` General / Other,
  `formation_filing` Formation / Filing, `compliance` Compliance,
  `registered_agent` Registered Agent, `ein_tax` EIN / Tax,
  `billing_refund` Billing / Refund Request, `customer_dispute` Customer
  Dispute (a service dispute or complaint — NOT a card chargeback),
  `filing_correction` Filing Correction / Incorrect Filing,
  `partner_issue` Partner Issue, `account_portal` Account / Portal. Set on
  New Case (all three contexts, and the Board's own New Case popup) or
  edited on Case Detail with `cases.edit`.
  Tags stay free-form. Existing Cases are never auto-categorized. The web
  app mirrors the list in `cases/src/lib/caseMeta.ts`
  (`test/case-meta.test.ts` keeps them identical).
- **Priority**: how urgent the work is — unchanged (`low|medium|high|critical`).
- **Status**: where the work is — `intake` (picker: Open), `in_progress`
  (Working), `review` (Pending Customer), `waiting` (Waiting on 3rd Party),
  `completed` (Closed).
- **Escalation**: an explicit, recorded hand-raise with a reason (below) —
  never implied by priority, category or age.
- **Terminal status**: only the existing `completed` (shown as "Closed").
- **Status history** (`store.caseStatusEvents`, append-only): every status
  change from Phase 7 on records `fromStatus`, `toStatus`, `kind`
  (`status_change` | `closed` | `reopened`), `changedAt`,
  `changedByUserId` (the session's employee — never the body) and
  `changedByName` (label as of the change). A no-op status update records
  nothing. Written only through `changeCaseStatus` (`src/caseLifecycle.ts`),
  called by `PATCH /cases/:id` (Case Detail, board drag, board modal).
- **closedAt** (+ `closedByUserId`, `closedByName`): set when a Case moves
  non-terminal → `completed` (or is created as `completed`: closed at
  creation by its creator); cleared on reopen; set again on the next close.
  Each closure stays in the history. **Legacy**: Cases already completed
  before Phase 7 have `closedAt: null` — the UI says "Closed date
  unavailable" — and it is never taken from `updatedAt`.
- **Resolution time** (`resolution` on `GET /cases/:id`), only when the Case
  is closed AND `closedAt` is known: `totalMs = closedAt − createdAt`
  (calendar time, creation → current closure; includes any reopened
  period). When the Case was reopened and closed again, `latestCycleMs` =
  last reopen → current closure and `closures` counts closures. No business
  hours, no waiting-time subtraction, no SLA targets.
- **Escalations** (`store.caseEscalations`, append-only): `reason`
  (`refund_request`, `customer_dispute`, `incorrect_filing`,
  `partner_issue`, `deadline_risk`, `customer_impact`, `other`), optional
  `note`, `escalatedAt/ByUserId/ByName`, `resolvedAt/ByUserId/ByName`. At
  most one unresolved per Case (409 `already_escalated`); resolved rows stay
  as history; a Case can be escalated again later, including a closed Case
  (e.g. a dispute after completion). Escalating does not change priority,
  status or `updatedAt`.
  - Raise: `POST /cases/:id/escalations` — `cases.work` on the Case.
  - Resolve: `POST /cases/:id/escalations/:escalationId/resolve` —
    `cases.edit` on the Case. (No new permission; `caseControls` exposes
    `escalate` / `resolveEscalation`.)
  - `activeEscalation` travels with the Case (list and detail);
    `GET /cases/:id` adds `statusHistory`, `escalations`, `resolution`.
    None of it reaches employees without case access.
- **Filters**: `GET /cases?category=<key>|uncategorized` and
  `?escalated=true|false`, composable with the existing filters; order
  unchanged (Last Modified).
- **Dashboard**: `cases.summary.activeEscalations`, `cases.escalated`,
  `cases.recentEscalations`, `workload[].escalated`, and — at team/all
  scope — `cases.byCategory` (open Cases). "Needs attention" = Cases with an
  unresolved escalation (first) plus open Cases that are high/critical or
  have overdue tasks. Widgets `case-escalations` (all case roles) and
  `case-categories` (team/all).
- **Storage**: additive, no schema version and no migration. Missing Case
  fields are filled with `null` and missing collections with `[]` in memory
  on load (`normalizeLoaded`); the file is only written by the next ordinary
  save. Store stays at schema v2.
- **Deferred — there is NO SLA engine and NO automatic escalation yet**:
  no SLA deadlines/timers, business-hours calendars, state-specific filing
  timelines, external alerts, chargebacks or AI categorization. Escalation is
  manual only.

### Case Thread — unified operational timeline (Phase 7 follow-up)

The Thread tab shows human comments interleaved with system activity, from
`GET /api/cases/:id/feed` (`src/caseFeed.ts`): `{ caseId, count, entries }`,
merged and ordered on the server. **The Case Thread is a reverse-chronological
operational timeline: newest activity first**, directly under the composer
(Case Detail and the Board's case popup render the server's order as-is).
Ties within a millisecond: the exact reverse of chronological order — recorded
changes (`caseActivities`) latest-recorded first by id, other entries by a
fixed type slot, then key — so the same data always gives the same order.
Same access as the Case
(`cases.view` + record scope). `GET /cases/:id/thread` still returns
comments only; posting comments (and @-mentions) is unchanged.

| Entry `type` | Source (derived unless noted) |
|---|---|
| `comment` | `threadEntries` — human comments; the only entries with @-mentions |
| `status_change` (`kind`: status_change / closed / reopened) | `caseStatusEvents` (Phase 7 lifecycle — the same events as the history card) |
| `category_change`, `priority_change`, `owner_change`, `account_change`, `primary_contact_change`, `task_completed`, `task_reopened` | **persisted** `caseActivities`, appended when the change happens (`recordCaseActivity`) — only on a real change, never on a no-op |
| `escalation_created`, `escalation_resolved` | `caseEscalations` |
| `task_created` | `tasks` (`createdAt`, `createdByUserId/Name`, `createdTitle` — the title at creation; titles are editable via `PATCH /tasks/:id`, so the entry never uses the current title. Tasks older than this field keep the title as first loaded after the upgrade, frozen, and the entry says "title as first recorded") |
| `document_uploaded` | `documents` (`createdAt`, `uploadedByUserId/Name`); `href` only for an http(s) `fileUrl` (the Documents tab's link), else no link |
| `calls_outgoing_summary`, `calls_incoming_summary` | `caseInteractions` with channel `phone`, ONE entry per direction: `count`, `latest` (who, when, contact, summary), up to 3 `previous`; positioned by its latest call (so a new call moves the card to the top), recomputed on every read — no stored counter |
| `contact_logged` | `caseInteractions` with other channels (email, SMS, meeting, other) — one compact entry each |
| `document_removed`, `automation_execution` | reserved types, never produced: no document removal exists, and no automation engine exists (the Run button only animates) |

- **Comments vs system activity**: the composer only ever posts human
  comments (`POST /cases/:id/thread`), which alone parse @-mentions and
  notify. System entries are rendered compact and secondary, never parse
  mentions, never notify, and cannot be edited or deleted. There are no fake
  "comments" written by the system. **No "Automation ran" entry is produced
  today** — automations do not execute.
- **Actors**: always the session's employee (id + name label as of the
  event); body-supplied names/ids are ignored. Historical labels are never
  rewritten.
- **Immutability**: every non-aggregated entry reads only values that cannot
  change after the event — comments, call logs and documents have no
  edit/delete routes; status events and `caseActivities` have no write routes
  at all; escalations only gain their one-time resolution; tasks are
  editable, hence `createdTitle`. Only the two call cards are intentionally
  live (recomputed from the call log). `test/case-feed.test.ts` pins this.
- **Not recorded** (never guessed): creators of tasks and uploaders of
  documents added before this change ("Creator/Uploader not recorded"), and
  completion of tasks completed before it (no entry). Title, description
  and tag edits are not timeline events. Viewing, searching and filtering
  are never logged.
- **Tasks** now keep `createdByUserId/Name` and the CURRENT completion
  (`completedAt`, `completedByUserId/Name`, cleared on reopen); every
  completion/reopen is in `caseActivities`.
- **Count**: the number beside Thread = `count` = feed entries (each call
  card counts once).
- **Storage**: additive — nullable task/document fields filled in memory on
  load, new `caseActivities` collection (empty when absent). No schema
  version, no migration.
- **Calls have no duration field**, so call cards show time, who and
  contact but no duration.

### Knowledge Base foundation (Phase 8)

Backend and content only — **no UI, no Case recommendations, no chatbot, no
embeddings, no LLM calls**. Code in `artifacts/api-server/src/knowledge/`.

- **One canonical repository** (`repository.ts` → `knowledgeBase`). The
  future article browser, Case recommendations and the Knowledge Assistant
  (hybrid RAG, in Messages as a "DMs | Knowledge Assistant" switch) must all
  read these same records. Do not build a second article store.
- **Granularity: ONE article per jurisdiction per entity type**
  ("California — LLC Services & Requirements"). Formation, Registered Agent,
  Annual Report… are **sections** of that article, never separate articles.
  A retrieval pipeline may later chunk by section; chunks are not articles.
  Validation rejects a second article for the same
  (entityType, jurisdiction, articleType).
- **Model** (`model.ts`): `KnowledgeArticle` = id, slug, title, entityType
  (`llc` | `corporation`), jurisdictionCode/Name (51-jurisdiction table),
  articleType (`state_services`), status (`draft|published|archived`),
  audience (`internal` — the only value), `internalOnly`, `counselReviewed`,
  `lastReviewedAt` (null = none recorded), createdAt/updatedAt, provenance
  (sourceId, pages, printed entry header, Contents-page highlight marker),
  aliases, `serviceProfile`, ordered `sections`, plus derived topics,
  serviceKeys and `flagSummary`.
- **Section**: stable id `<articleId>:<key>` (e.g.
  `llc-az-state-services:open_research_item_publication`), key, label,
  `sourceHeading` (as printed), order, kind (`standard` ×8,
  `state_specific` = the ninth section, `highlighted` = shaded boxes), flag,
  clientDisclosure, verification, highlightCategory, notApplicable, verbatim
  content, sourcePages, topics, serviceKeys, `citation`
  ("Arizona — LLC Services & Requirements → Open Research Item — Publication")
  and `contentHash` (sha256; a later indexer re-embeds only changed sections).
- **Flags** (what the SOURCE says a section is): `none`,
  `state_requirement`, `client_disclosure` (+ `required`|`recommended`, as the
  source distinguishes), `known_service_gap` (a defect in OUR catalog),
  `open_research_item`, `source_discrepancy`. **An Open Research Item is
  always `verification: "unverified"`** — the only unverified sections — and
  must never be presented as a confirmed requirement. A highlighted title the
  source does not list (Florida's "Fees and Late Penalty") is kept as written
  with highlightCategory `unlisted`.
- **Status semantics:** `published` = available INTERNALLY to employees with
  `knowledge.view`. It never means customer-facing or counsel-approved; every
  article is `audience: "internal"`, `internalOnly: true`,
  `counselReviewed: false` because its source says so.
- **Source fidelity.** The only source for LLC content is
  `LLC-Formation-Services-by-State.pdf` (Cloud Peak Law — Company Sage,
  prepared 2026-09-10, sha256 `308c346e…3c241b8d`; 106 content pages — the
  file's pages 107–316 carry only a header and footer). Section text is
  copied verbatim (pdftotext `-raw`, lines joined with one space;
  `content/llcPilot.ts` is generated by
  `scripts/knowledge/generate_llc_pilot.py <path-to-pdf>` (needs poppler
  `pdftotext`; the PDF is not committed) — do not hand-edit prose). Nothing is
  corrected, reconciled with other sources, completed or merged with
  Corporation rules. `content/llcSource.ts` keeps the document's own notices
  verbatim (confidentiality, N/A meaning, service gaps vs research items,
  fulfillment, data origin, filing fees, services not provided, BOI delivery
  risk).
- **Validation** (`validate.ts`, runs at startup — invalid content refuses to
  load): canonical nine sections in the source's order, then only
  highlighted boxes; order numbers; N/A marker; flags agree with the printed
  heading; open research items unverified; **every topic and service key is
  supported by its own section's text** (evidence patterns in `model.ts`);
  every `serviceProfile` value quotes its section verbatim; the article can
  claim no more than its source (internal-only, not counsel-reviewed);
  unique id/slug/identity.
- **Pilot content (five LLC articles):** Arizona, California, Delaware,
  Florida, Wyoming — `published`. Highlighted: AZ "Open Research Item —
  Publication"; CA "Franchise Tax — Client Disclosure Required"; DE "Annual
  Tax"; FL "Fees and Late Penalty — Client Disclosure Recommended"; WY none.
  State-specific section is "N/A" for DE and FL.
- **Storage:** none in `store.json`. Articles are code-reviewed,
  source-controlled content, built into a frozen in-memory repository at
  startup — no collection, no seq counter, no schema version, no migration.
  When editing arrives (`knowledge.manage`, not yet defined), move the same
  record shape into a store collection or database.
- **API** (read-only, `knowledge.view`): `GET /api/knowledge/articles`
  (filters `entityType`, `jurisdiction` (any case), `status`, `topic`,
  `flag`, `q` — a plain all-words match per section; unknown parameters or
  values → 400) returns summaries with the section outline;
  `GET /api/knowledge/articles/:idOrSlug` returns the full article with its
  source record. Readers see only `published` articles; anything else is 404.
- **RBAC:** reuses the existing `knowledge.view` (every operational role incl.
  HR; reserved roles none — unchanged matrix). No new permission.
- **Corporation later:** `entityType: "corporation"` is in the model; its
  section template is defined only when
  `Corporations-51-Jurisdiction-Reference.pdf` is ingested (validation refuses
  corporation articles until then). Titles/ids never collide with LLC ones.
- **Future Case matching** can key on entityType, jurisdictionCode, topics,
  serviceKeys, flags and serviceProfile; nothing is connected to Cases yet.

#### Shared / national services — direct vs inherited vs effective (8A follow-up)

The source restates some services in every entry, yet the Delaware, Florida
and Wyoming entries do not print the national add-on list. **Omission is
not unavailability**, and **no text is copied into an article** — the
distinction lives in metadata with a citation path.

- **Three layers.** *Direct* = printed in the jurisdiction's entry
  (`directServiceKeys`/`directTopics`, identical to the old `serviceKeys`/
  `topics`). *Shared* = explicit source rules in `content/llcShared.ts`
  (`KnowledgeSharedService`). *Effective* = what may be treated as
  applicable: `effectiveServiceKeys` = services whose status is `direct` or
  `inherited`; `effectiveTopics` = direct ∪ inherited topics.
- **KnowledgeSharedService**: id, entityType, serviceKey, scope
  (`national` | `jurisdictions` + list), availability (`offered` |
  `not_offered` | `varies_by_state` | `exclusive`), termsVaryByState, topics,
  `evidence[]` and `caveats[]` (each: sourceId, location = a source notice
  or an article section, verbatim `quote`, the exact `term` naming the
  service), `mappingNote` (when a generic source term such as "banking" names
  a catalog service). Validation: every record has evidence; every quote is
  in the stored text; every term is in its quote; topics are supported;
  **a conflict between records, or between a rule and an entry, must be
  recorded as a discrepancy** or the content refuses to load.
- **The source's explicit shared statements** (nothing inferred from a
  service merely appearing in several entries):
  - p. 3 "WHAT VARIES BY STATE, AND WHAT DOES NOT": LLC formation
    selectable in all 51 jurisdictions; EIN, operating agreements, S-corp and
    other tax elections, apostille, banking, the corporate binder and the
    governance document library "priced flat nationally and do not vary";
    formation filing, registered agent, annual report and renewal filing,
    amendments, certificates and certified copies, DBA, foreign registration,
    dissolution and conversions "genuinely vary by state" (no national
    default).
  - In-entry (printed in 45 of the 51 entries; not DE, DC, FL, NM, TX, WY):
    "Available nationally regardless of state: Virtual Office …, mail receipt
    / scanning / forwarding, Instant Bank Account …, business insurance …,
    business financing referral …, and Corporate Transparency Act / BOI
    compliance", and "State-varying services include …".
  - p. 3 "SERVICES WE DO NOT PROVIDE": trademark registration, standalone
    business license services, tax preparation/filing → `not_offered`.
  - p. 3 BOI delivery risk → a caveat carried by `boi_compliance` wherever it
    applies. Wyoming: products restricted to Wyoming → `exclusive` [WY].
    Arizona: "no renewal filing is sold" → `not_offered` [AZ].
- **`serviceAvailability`** (every catalog service, every article):
  `status` = `direct` | `inherited` | `not_offered` | `restricted` |
  `disputed` | `unknown`, a `reason` code, `directlyMentioned`,
  `sourceScope` (`jurisdiction` | `national` | `other_jurisdictions`),
  `directSectionIds`, `sharedServiceIds`, `discrepancyIds`, `caveats`.
  Resolved in `availability.ts`, most specific first: (1) an availability
  discrepancy → disputed; (2) a rule for THIS jurisdiction saying not
  offered → not_offered; (3) restricted to other jurisdictions →
  restricted; (4) printed in the entry → direct; (5) national not-a-product
  → not_offered; (6) national offered → inherited, or disputed if the
  national claim is contested; (7) varies by state and silent → unknown;
  (8) nothing → unknown. **Silence never yields not_offered.**
- **Discrepancies** (`KnowledgeSourceDiscrepancy`, `resolution: null`
  always): conflicting verbatim claims side by side, with effect
  `blocks_inheritance` or `disputes_availability`. Recorded:
  *corporate binder* (p. 3 flat-national vs the entries' state-varying list →
  never inherited; disputed in DE/FL/WY, still direct in AZ/CA) and *Convert
  LLC to Close LLC* (listed as state-varying in other entries vs Wyoming's
  "restricted to Wyoming" → disputed everywhere except WY, including AZ/CA
  where it is printed). Neither is resolved in code.
- **Pilot result:** DE, FL, WY inherit virtual office, mail forwarding,
  Instant Bank Account, business insurance, business financing referral and
  BOI compliance (national, not directly mentioned); AZ and CA state them
  directly. Wyoming-only products are `restricted` in AZ/CA/DE/FL.
  Unprinted state-varying services (e.g. DE's DBA; DE/FL/WY foreign
  registration, dissolution, reinstatement) are `unknown`.
- **API** (additive): list summaries add `direct*`/`inherited*`/`effective*`
  topics and service keys and `disputedServiceKeys`; new filters `service`
  and `metadata=effective|direct` (topic/service match effective metadata by
  default); `q` reports printed matches in `matchedSectionIds` and inherited
  ones separately in `matchedInheritedServiceKeys`. The detail response adds
  `serviceAvailability`, the `sharedServices` and `sourceDiscrepancies`
  bearing on the article, each with human-readable citations
  (e.g. "LLC Formation Services by State → WHAT VARIES BY STATE, AND WHAT
  DOES NOT (p. 3)" vs "Florida — LLC Services & Requirements → Additional
  Services Available"). No new route.
- **Future RAG must answer conservatively from `serviceAvailability`**:
  distinguish direct / inherited (cite the national rule) / not offered or
  restricted (cite the rule) / disputed (show both claims) / unknown (say
  so) — never turn silence or a dispute into a yes or a no.

### Knowledge Base UI (Phase 8B)

Read-only employee UI over the same repository — **five LLC pilot articles
only; no editing, no Case integration, no chatbot.**

- **Routes** (`App.tsx`, guarded by `ROUTE_ACCESS` in lib/access, both
  `knowledge.view`): `/knowledge` (discovery/search; filters in the URL —
  `?q=&entityType=&jurisdiction=&topic=` — typing replaces the history
  entry, choosing a filter adds one so Back undoes it) and
  `/knowledge/:slug` (reader; `#<section key>` anchors, honoured on load
  and refresh). Without the permission: no sidebar entry and No Access
  before the page mounts, so no `/api/knowledge` request is made.
- **Sidebar:** the `knowledge` nav item is now in-app ("Knowledge",
  `/knowledge`, `knowledge.view`); the old external-link placeholder and
  `VITE_KNOWLEDGE_BASE_URL` are gone. Every operational role (incl. HR)
  sees it; reserved roles get no application.
- **Files:** `pages/Knowledge.tsx`, `pages/KnowledgeArticle.tsx`,
  `components/knowledge/parts.tsx` (chips/tones), and the pure
  `lib/knowledge.ts` — API response types (re-exported from `lib/api.ts`),
  topic/service labels mirrored from the API (agreement tested in
  `test/knowledge-ui.test.ts`) and every presentation rule.
- **Discovery:** search box + Entity type / State / Topic selects whose
  options come only from articles that exist (LLC is the only entity type;
  no placeholder states). Results are compact rows: state code, title,
  entity type, section count, "Internal", highlighted-section chips. Search
  and topic use the API's EFFECTIVE metadata; each result explains its
  match — "Matched in: <sections>" (printed text) vs "Matched through
  national shared service — X (not printed in this state's entry)"; a query
  naming a disputed service shows "Source discrepancy — X (not confirmed)".
  Empty: "No Knowledge Base articles match your search." plus "not that a
  service is unavailable".
- **Reader:** header (title, state, entity type, source document, publisher,
  prepared date, source pages, "Not reviewed by counsel", "No internal
  review recorded") and the source's own confidentiality notice verbatim as
  the "Internal reference" strip. Sections in stored order with source page;
  table of contents (sticky on desktop, collapsible on mobile). Flag
  presentation (`sectionPresentation`): Open Research Item → dashed violet
  "Open research item · Unresolved" + "treat as an unanswered question";
  Known Service Gap → orange; Client disclosure → amber with Required /
  Recommended; State requirement → blue; N/A → muted.
- **Panels beside the text (never inserted into it):** *Shared services
  applicable to <State>* — nationally stated services that are inherited
  ("Applies from a national source statement", each with its source
  citation and optional quote) or disputed; services also printed in the
  entry sit in a collapsed "Also printed in the <State> entry" list;
  caveats (BOI delivery risk) shown. *Source discrepancies* — each
  disputed service with the open question and every conflicting quote, badge
  "Source discrepancy — not confirmed". *Not offered in <State> (per
  source)* — collapsed; only explicit not-a-product / not-sold-here /
  restricted-to-other-states statements with their citation. Unknown
  services are not listed.
- **Wording rules** (`availabilityPresentation`): only direct and inherited
  assert availability; disputed = "Source discrepancy — not confirmed";
  unknown = "No confirmed information in the current Knowledge Base" (never
  "No").

### Domain model

- **Account** — a company; ~46 Salesforce-style entity-formation fields.
- **Contact** — a person; not owned by an account. The UI calls contacts
  **Clients**.
- **AccountContactLink** — many-to-many join: `role`, `ownershipPct`,
  `isPrimary`, `isSignatory`, `startedAt`, `endedAt`. A link is *active* while
  `endedAt` is null. One contact can sit on several accounts (seed: Hassan
  Patel, contact #3, on accounts #3, #4, #5).
- **Lead** — pre-qualification record; `POST /leads/:id/convert` creates
  Account + Contact + Link and optionally a first Case.
- **Case** — `accountId` (required) and `primaryContactId` (nullable). No
  email/phone of its own — those are read through the contact. Status
  `intake|review|in_progress|waiting|completed`; priority
  `low|medium|high|critical`; tags; owner; `createdAt`, `updatedAt`;
  Phase 7: `category`, `closedAt`/`closedByUserId`/`closedByName`.
- Around a case (Phase 7): **CaseStatusEvent** (status history),
  **CaseEscalation** (§2 Case lifecycle) and **CaseActivity** (recorded
  changes for the Thread: category, priority, owner, account, primary
  client, task completed/reopened; §2 Case Thread). **Task** also records
  `createdBy*`, `createdTitle` and the current `completed*`; **Doc** records
  `uploadedBy*`.
- Around a case: **Task**, **Doc**, **CaseInteraction**, **CaseThreadEntry**,
  **Mention**.
- **Automation** — a saved visual workflow graph, scoped `case` or `global`
  (§3.1).
- **Conversation / Message** — team chat.

**Account ids and Contact ids are independent sequences.** The same number
names unrelated records (account #6 is Mendoza Architecture; contact #6 is
Robert Chen). Never use one where the other belongs — see §3.4.

### API

**67 routes** under `/api` (the reviewed table in
`test/route-guards.test.ts` must list every one): auth (login, logout, me);
cases (list with status/priority/search/assignee/account/contact/**category**/
**escalated** filters, create, detail with `statusHistory`/`escalations`/
`resolution`, update); `POST /cases/:id/escalations` and
`…/escalations/:escalationId/resolve`; `GET /cases/:id/feed` (unified Thread)
and `GET|POST /cases/:id/thread` (comments); `GET|POST /cases/:id/contacts`
(call/contact logs); tasks; documents (create only); accounts; contacts;
account-contacts; leads incl. convert; reassignment
`PUT /{cases|leads|accounts|contacts}/:id/owner` and
`GET /owners/{type}/candidates`; mentions; team; `GET /dashboard`; stats;
conversations + messages; **automations** (10 routes, §3.1); the
`/customers` compatibility shim (§6.1); and the read-only **Knowledge Base**
(`GET /knowledge/articles`, `GET /knowledge/articles/:idOrSlug`, Phase 8).
Web routes add `/knowledge` and `/knowledge/:slug` (Phase 8B); no API route
was added for the UI.

---

## 3. Features added since recovery

### 3.1 Case Automations — management only

> **Automation *management* is implemented. Automation *execution* is not.**
> Nothing in the server evaluates triggers, walks a graph, or performs an
> action. Saving, applying, customizing or enabling an automation changes
> stored data only. The execution engine is postponed until the third-party
> integrations it would call (email, Slack, HTTP targets, …) are chosen.

**Where it lives.** Automations exist **only inside individual cases**: Case
Detail → **Automations** tab (last tab: Overview, Contacts, Thread, Tasks,
Documents, Automations). The old standalone Automations page was removed; the
`/workflow` URL redirects to `/records/cases`, and `/cases/:id#workflow` is an
alias for the Automations tab. The Kanban board's case modal
(`CaseDetailModal`) has **no** Automations tab.

**Model** (`Automation` in `store.ts`): `id`, `name` (1–80 chars, trimmed),
`scope`, `caseId` (set iff `scope === "case"`), `graph` (`nodes`, `edges`,
optional saved `viewport`), `enabled`, `derivedFromAutomationId`,
`originCaseId`, owner and created/modified audit fields. Node types:
trigger, filter, assign, notify, delay, branch, http, update — each with a
free-form string `config`.

**Scopes.**
- **Case** — owned by one case, invisible to every other case.
- **Global** — one row with `caseId: null`, offered to **every case, existing
  and future**, by a union computed at read time
  (`effectiveAutomationsForCase`). Globals are never copied per case, so a
  case created tomorrow already has today's globals.

**In the tab:**
- **Selection dropdown** (`AutomationPicker`) — a native `<select>` with
  "This case" and "Global" option groups; a scope pill marks the selection.
- **Create** — "New automation" asks for a name and a scope (this case / all
  cases). Choosing all cases shows a confirmation, then creates the global in
  **one request** (`POST /cases/:id/automations` with `scope: "global"`;
  `originCaseId` records where it came from).
- **Edit and save** — the visual builder (`AutomationBuilder`: drag nodes,
  pan, zoom, connect, per-node config popup). Save persists name + graph
  (+ viewport). Saving a **global** first shows "Save changes to all cases?"
  with the number of cases it reaches (`GET /automations/:id/usage`); cases
  that customized their own copy are unaffected.
- **Unsaved-change protection** — an "Unsaved changes" marker; switching to
  another automation or another Case Detail tab with unsaved edits asks to
  discard first; leaving the page triggers the browser's unload warning.
- **Apply to all cases** — promotes a case automation to global **in place**
  (`POST /automations/:id/promote`), after confirmation.
- **Customize for this case** — forks a global into a case-scoped deep copy
  with `derivedFromAutomationId` (`POST /automations/:id/fork`). That case then
  sees its copy instead of the global; other cases are unaffected.
- **Revert to global** — deletes the copy so the case inherits the global
  again (`POST /automations/:id/revert`, after confirmation). Refused with 409
  if the original global no longer exists.
- **Delete** — a case automation deletes after a simple confirmation. A
  **global** requires typing its exact name and shows how many cases it
  reaches and how many have customized copies; those copies survive as
  independent case automations (their provenance pointer is cleared). The
  typed-name safeguard is **UI-only**; `DELETE /automations/:id` itself has no
  confirmation step.
- **Run** — only animates the edges for ~2 s. It executes nothing.
- Scope actions are disabled while there are unsaved edits.

**API:** `GET/POST /cases/:id/automations`, `GET /automations` (library
listing, filter by `?scope=`; not used by the UI), `GET/PATCH/DELETE
/automations/:autoId`, `GET /automations/:autoId/usage`, `POST
/automations/:autoId/{promote,fork,revert}`. Errors: `already_global`,
`not_global`, `already_customized`, `not_customized`, `original_deleted`
(409), `case_not_found` / `not_found` (404).

**Persistence and migration.** Automations persist in `store.json` with
everything else. A store written before automations existed loads unchanged
and gains an empty `automations` array and a valid `seq.automation`
(`test/migration.test.ts`); it does **not** receive the seeded global.

**Not implemented:** execution (above); the `enabled` flag has no UI control
and nothing reads it; no run history or logs.

### 3.2 Contextual case creation

One shared form, `components/cases/NewCaseDrawer.tsx`, opened in three
contexts:

- **Cases section** (`global`) — pick the account (from `/api/customers`);
  the contact is optional.
- **Account page** (`account`) — the account is fixed; choose one of its
  linked contacts. A sole contact is selected automatically.
- **Client page** (`client`) — the client is fixed; choose one of *their*
  accounts. A client with one account has it selected automatically; a client
  on several companies must pick one. A client with no linked account is
  offered an inline "link to an account" step (`POST /account-contacts`).

The selected contact's **email and phone** are shown read-only for
confirmation; they are never stored on the case. After creating from an
Account page, the page switches to its Cases tab.

**Backend enforcement** (`POST /api/cases`): the account must exist
(`missing_account`, `unknown_account`); a `primaryContactId`, if given, must
exist (`unknown_contact`) and be **actively** linked to that account
(`contact_not_linked_to_account`). Legacy `customerId` is still accepted as an
alias for `accountId`. An optional **`category`** (Phase 7) is validated
against the ten keys; `null`/omitted = uncategorized.

**Case creation paths (all offer the optional Category):**
1. Records → Cases → New case (`NewCaseDrawer`, `global` context).
2. Account page → New Case (`account` context).
3. Client page → New Case (`client` context).
4. Records → Cases → **Board** → green "+" on the selected account card —
   the Board's own older popup (`NewCaseModalForClient` in
   `CasesBoard.tsx`): title, description, status pills, Category; posts
   `customerId`, fixed medium priority, no primary contact (§6.3).
5. Lead conversion with "create first Case" (needs `cases.create`; no
   category — uncategorized).

### 3.3 Consolidated Records workspace

- Sidebar (full set, System Owner): Dashboard, Leads, **Records**, Insights,
  Messages, Accounting, Settings — each role sees only its permitted items
  (§2 Frontend access). Records replaces the separate Accounts / Clients /
  Cases entries and stays highlighted on any records list or detail URL.
  Records tabs are permission-driven too (Business Advisors: Accounts and
  Clients only).
- `/records/:tab` with tabs **Accounts | Clients | Cases**
  (`pages/Records.tsx`). Each tab renders the existing page unchanged —
  `Accounts`, `Clients`, `CasesList` with its Table / Cards / Board views,
  filters and New Case — and only the active tab is mounted. The tab is in
  the URL, so refresh and bookmarks keep it. Unknown tabs redirect to
  `/records/accounts`.
- **Backwards compatibility:** `/records` → `/records/accounts`;
  `/accounts`, `/clients`, `/contacts`, `/customers`, `/cases` redirect
  (with `replace`) to the matching tab.
- **Detail pages are unchanged:** `/accounts/:id`, `/clients/:id` (and
  `/contacts/:id`), `/cases/:id`. Their back links return to the matching
  Records tab ("Back to Cases" → `/records/cases`, etc.), as do the
  Dashboard's "view all" links.
- The URL contract lives in the pure module `lib/records.ts` and is tested by
  `test/records-routing.test.ts`.

### 3.4 Corrections

- **Case Detail links.** The Details card showed one "Customer" link to
  `/clients/{customer.id}` — but `customer.id` is the **Account** id. It now
  shows **Client** → `/clients/{primaryContactId}` and **Account** →
  `/accounts/{accountId}` separately (`lib/caseLinks.ts`). A case without a
  primary contact shows "No primary contact" and no client link; a
  `primaryContactId` whose contact no longer exists shows "Client #N (not
  found)" without a link.
- **Kanban (Board view).** The client card is an Account (a
  `/api/customers` row). Its "Open full portfolio" icon linked to
  `/clients/{accountId}`. Now the company name and the icon open the
  Account, and the person's name opens `/clients/{primaryContactId}` — a new
  field on `/api/customers` rows naming the contact the row already shows.
  The board's case modal Client link had the same bug and was fixed the same
  way.
- **Case edit validation.** `PATCH /api/cases/:id` previously accepted any
  contact id and ignored `accountId`. It now accepts `accountId` and applies
  the POST rules to the relationship the case would have *after* the update:
  unknown account → `unknown_account`; new/changed contact must exist and be
  actively linked to the resulting account; moving a case to an account its
  current contact is not linked to → `primary_contact_not_linked_to_account`
  unless a linked replacement is supplied or the contact is cleared with
  `null`. The server never picks a contact. Only a *changed* relationship is
  re-checked, so ordinary edits keep working — even on cases whose contact
  link has since ended. Nothing is written when a check fails. No UI moves a
  case between accounts yet.
- **Cases table sorting** (Records → Cases → **Table** only):
  - **Case #** (far left) and **Created** (far right) headers cycle
    **ascending → descending → default**. One column at a time; clicking the
    other column starts its own cycle at ascending.
  - Default = **Last Modified**: `updatedAt` newest first, ties by case number
    ascending — identical to the order `GET /api/cases` returns.
  - Case numbers sort numerically (CASE-9 before CASE-10); Created compares
    real timestamps; ties are deterministic.
  - Active column shows an up/down arrow in the primary colour; the default
    shows none (a faint ⇅ appears on hover only). `aria-sort` and tooltips
    describe the current and next order.
  - Client-side over the rows the server returned after search/filters;
    records are never modified. Logic in `lib/caseSort.ts`.

---

## 4. What works

| Area | State |
|---|---|
| Sign-in / sessions | HttpOnly session cookie, scrypt passwords, throttling, same-origin check; every route guarded (§2 Authentication) |
| RBAC | Permissions + own/team/all scope enforced by the API, mirrored by the web app (§2) |
| Dashboard | Personalized by permission from `GET /api/dashboard` (§2 Dashboards) |
| Leads | List, filter, create, edit, delete, convert; reassignment |
| Records → Accounts | List, search, detail with ~46 inline-editable fields (by field group, sensitive fields masked), contacts, cases, New Case |
| Records → Clients | List/cards, create, detail with linked accounts and cases, New Case |
| Records → Cases | Table (sortable Case # / Created, default Last Modified), Cards, Board; filters by status, priority, **category**, **escalation**, search, assignee; category/escalation markers |
| Case detail | Overview, Contacts (call/contact log), **Thread (unified timeline)**, Tasks, Documents, Automations; Client and Account links; category, escalation banner/actions, closed date and resolution time, lifecycle & escalation history |
| Case automations | Management as in §3.1; **no execution** |
| Mentions | `@Name` in comments, resolved server-side to active employees who may view the case; your own inbox only |
| Messages | DMs, groups, case tagging (filtered by case access), soft delete by the author; member-only |
| Knowledge Base | Five internal LLC pilot articles: search/filter page and reader with flagged sections, shared-service provenance, source discrepancies (Phase 8B); read-only |
| Insights | Case analytics off `/stats` and `/cases` (`insights.cases.view`); Sales and People domains planned |
| Accounting | **Prototype data only** (visibility gated: statements vs Payroll) |
| Settings | Mostly prototype UI (local state), sections gated by permission |

### Test coverage

`pnpm test`: Vitest + Supertest, **54 files / 778 tests** in
`artifacts/api-server/test/`. Covers authentication (passwords, sessions,
expiry, revocation, throttling, spoofing, same-origin, the 401 on every
route), the permission core (the approved matrix cell by cell, resolver,
Account field groups and redaction, navigation and route metadata, controls,
dashboard rules), authorization (every route declared, role × route for
every role, record scope, forbidden fields, case/lead isolation, messages,
mentions), stable ownership (v1/v2 migrations, refusal on unmapped/ambiguous
names, rename safety), team scope and reassignment, dashboards (scope, no
leakage, zeros), case lifecycle/categories/escalations, the Thread feed
(merging, newest-first order, ties, immutability, call aggregation,
mentions, RBAC), a pre-Phase-7 store loading without migration, the
Knowledge Base (model rules, the five pilot articles re-checked word for word
against a raw extract of the source PDF in `test/fixtures/`, shared/national
service rules, direct vs inherited vs effective availability and precedence,
the read API and its access, a pre-Phase-8 store loading unchanged), and the
API
end to end — plus pure frontend modules imported directly (`lib/records.ts`,
`lib/caseLinks.ts`, `lib/caseSort.ts`, `lib/caseMeta.ts`, `lib/session.ts`).

Isolation is enforced: `test/setup.ts` chdirs into a temp directory before the
store loads, so the suite cannot touch the live `store.json`
(`test/isolation.test.ts` asserts it). Pool is `forks`.

`pnpm test:e2e`: **Playwright, 67 tests in 5 files** (`e2e/tests/`:
`rbac.spec.ts`, `dashboard.spec.ts`, `lifecycle.spec.ts`,
`thread.spec.ts`, `knowledge.spec.ts`). It starts its own API on 3101 with a fresh temp store
(`CASES_DATA_DIR`) and Vite on 5174; `E2E_BASE_URL` points it at servers you
started yourself. `e2e/` is outside the pnpm workspace:
`@playwright/test` 1.56.1 pinned in `e2e/package.json`, locked by
`e2e/package-lock.json`, installed with `npm ci`.

**CI** (`.github/workflows/ci.yml`, on push/PR to `main`): job `verify`
(matrix Node 20 and 22: frozen `pnpm install`, `pnpm typecheck`,
`pnpm test`, plus guards that the live store is absent and the checkout is
unchanged afterwards) and job `e2e` (Node 22, `npm ci` in `e2e/`,
Playwright Chromium). Actions pinned by SHA; read-only permissions.

React components have no unit tests; browser behaviour is covered by the
targeted Playwright suite.

---

## 5. Prototype-only and not started

**Prototype-only** (local `useState`, hardcoded data, nothing persists):
- **Accounting** (~780 lines) — ledger, statements, payroll, all from
  constants. Only its visibility is real (RBAC).
- **Settings** (~930 lines) — divisions/teams display, pipeline stages,
  company config are local UI; sections are gated by permission. It does not
  read or write the real `store.teams`.

**Not started / deferred:**
- **Automation execution** (see §3.1) and any third-party integrations.
- **SLA engine** — no SLA targets, timers, business-hours calendars or
  state-specific filing timelines; **no automatic escalation**.
- **People management** — no UI to invite, deactivate, rename or change
  employees' roles/teams (planned sections stay hidden).
- **AI layer** — case summaries, issue explanation, suggested replies, the
  Knowledge Assistant (hybrid RAG over the Knowledge Base, with hand-off of an
  unanswered question to a supervisor by DM). Nothing references any LLM; no
  embeddings or vector store exist.
- **Knowledge Base beyond 8B** — the remaining 46 LLC jurisdictions,
  Corporation articles, Case recommendations (8C), the Knowledge Assistant,
  editing (`knowledge.manage`).
- **Billing / payments** — no Stripe, refunds, chargebacks, revenue,
  commissions or goals.
- **Phone system** — calls are logged by hand; no durations, recordings or
  call volumes.
- Client-facing comments (the thread is employees-only), real file upload
  (documents are URL references), email ingestion.

---

## 6. Technical debt — known, deliberate, not to be "cleaned up" unasked

### 6.1 The unfinished Customer → Account migration

- `caseWithRelations()` synthesizes a flat `customer` object (**`customer.id`
  is the Account id**) and a deprecated `customerId` (= `accountId`) on every
  case it returns.
- `GET /api/customers[/:id]` project Accounts into the legacy shape via
  `legacyCustomerView()` (`id` = Account id; `name`/`email`/`phone` from the
  account's primary-or-first contact; `primaryContactId` names that contact).
- **Still load-bearing:** the Board view (`CasesBoard.tsx`) and the global
  New Case form (`NewCaseDrawer`, Cases-section context) read
  `/api/customers`. `POST /api/cases` still accepts `customerId`.
- Pages still showing `customer.name`: Cases table and Cards "Customer"
  column, Dashboard recent cases, Insights top customers.

### 6.2 The server-generated stand-in contact

`caseWithRelations()` fills `primaryContact` with the account's primary (or
first linked) contact when the case has **no** `primaryContactId`, or one that
no longer exists. So `primaryContact` is not always the case's primary
contact; only `primaryContactId` is authoritative.
- **Depends on it:** every `customer.name` display in §6.1.
- **Deliberately ignores it:** Case Detail links and the board's case modal
  (`lib/caseLinks.ts` requires `primaryContact.id === primaryContactId`).
- **Recommendation:** address it in a future cleanup together with §6.1 —
  return `primaryContact` only for a real `primaryContactId`, and have those
  pages show the Account or "No primary contact". It changes what those
  pages display, so it needs a product decision. Documented in code above
  `caseWithRelations`; behaviour pinned by `case-links.test.ts` and
  `case-update-validation.test.ts`.

### 6.3 Duplicated case UI and case creation

- `pages/CaseDetail.tsx` (~1030 lines) and `components/CaseDetailModal.tsx`
  (~790) are two implementations of the case screen. The modal (opened from
  the Board) has Overview, Contacts, Documents and Thread only — **no Tasks
  and no Automations**. Both render the same unified Thread feed.
- **Duplicate case creation on the Board:** `NewCaseModalForClient` in
  `CasesBoard.tsx` is a separate form. It posts `customerId` only, so cases
  created from the Board **never get a primary contact**, and it bypasses the
  shared `NewCaseDrawer`. It does offer the optional Category (from the
  shared `lib/caseMeta.ts` list) — keep new Case fields in both forms until
  they are merged.
- `components/layout/MessagesWidget.tsx` (~1000) and `pages/Messages.tsx`
  (~400) overlap (both are reachable: the floating widget and the sidebar's
  Messages page).

### 6.4 Dead files

Unrouted and imported by nothing: `pages/Customers.tsx` (still links to
`/clients/{accountId}` — unreachable), `pages/Contacts.tsx`,
`pages/ClientPortfolio.tsx`.

### 6.5 The three lib packages are stale

- `lib/api-spec/openapi.yaml` documents ~11 paths from the pre-Account era.
- `lib/api-client-react` exports nothing; Orval has never run. **Do not run
  `pnpm api:generate`.**
- `lib/db/src/schema.ts` models only the retired tables; no migrations. The
  app does not use it.

### 6.6 Data and auth

- **JSON-file store**: single process, whole-file rewrites, no transactions,
  no concurrent-user safety, no relational database.
- **Demo credentials**: every employee uses `test123`; the login page lists
  them in development builds. Sessions and login throttling are in-process.
- **Not production-grade**: no SSO/MFA, no password change or reset UI, no
  audit log, no People UI (no rename/deactivate/role changes). A future
  rename feature should refresh the denormalized `ownerName` labels
  (history names stay as written).
- **Types duplicated** between `api-server/src/store.ts` and
  `cases/src/lib/api.ts` (and the taxonomy between the two `caseMeta.ts`,
  pinned equal by `test/case-meta.test.ts`); edit together.

### 6.7 Behaviour limits

- **Last Modified ≠ last activity.** `Case.updatedAt` changes on create,
  `PATCH /cases/:id` (any PATCH, even a no-op) and reassignment. Comments,
  call logs, tasks, documents, escalations and automation edits do **not**
  touch it, so the default table order reflects edits to the case record.
- **Sort preference is not persisted** (CasesList state; not in the URL).
- **Automation delete safeguard is UI-only** (§3.1).
- `findOrCreateDm()` is never called; duplicate DMs are reachable (pinned by
  `messages.test.ts`).
- **Tasks have no assignee**; dashboards attribute task counts to the Case
  owner. Task titles/descriptions/due dates are editable via
  `PATCH /tasks/:id` (no screen edits titles; the Tasks tab only cycles
  status). Tasks cannot be deleted.
- **Documents cannot be edited or deleted**, and `POST /documents` accepts
  any non-empty `fileUrl` string (no URL validation). The Documents tab
  links the raw `fileUrl`; the Thread links only http(s) URLs.
- **Calls have no duration field**; channels email/SMS/meeting/other are
  logged the same way as calls.
- **Lead conversion history is not reliable**: `convertedAt` lives on the
  lead, the converting employee is not recorded, and deleting a lead loses
  it — so no conversion metrics or leaderboard.
- The Case Detail title field saves on every keystroke (one PATCH per key),
  which is why title edits are not Thread events.
- **Demo data ownership**: the seeded leads and accounts are owned by Iris,
  Devon and Sara, so Business Advisor dashboards show real zeros until
  records are reassigned to them.

### 6.8 Smaller items

- `POST /accounts` inlines all ~46 fields rather than using `makeAccount()`.
- Tailwind v4 is a **beta** (`4.0.0-beta.6`); esbuild pinned to `0.21.5` by a
  root override.
- `test/helpers/app.ts` duplicates `index.ts`'s error handler.
- **React warning** (dev console): the Sidebar nests an `<a>` inside
  Wouter's `<Link>` (which renders its own anchor) — "`<a>` cannot be a
  descendant of `<a>`". Several older pages use the same `<Link><a>`
  pattern; new code passes `className` to `<Link>` instead.
- Stale code comments: the header comment of `CaseAutomationsTab.tsx` still
  says scope actions "arrive in a later stage" and globals are read-only
  (both are implemented); the comment above the `/customers` shim still
  mentions the old `/customers` page.
- Two zero-byte `_tmp_3_*` files from the machine transfer, git-ignored.

---

## 7. Recommended next work

Nothing is in progress. Each phase starts only after the owner's explicit
approval, and ends with typecheck, the unit/API suite, the Playwright suite
and CI all green, committed separately and not pushed automatically.
Candidate next phases (none started):

0. **Knowledge Base next steps** (each separately approved): Phase 8C Case
   recommendations (match Case entity type / state / category / tags to
   effective metadata, showing direct vs inherited evidence); ingest the
   other 46 states + D.C. from the same PDF with the Phase 8 extraction
   rules (the shared rules in `llcShared.ts` then apply unchanged; classify
   the 16 remaining highlighted boxes, e.g. "Annual Certificate and Agent
   Fee", "…— Verify Before Relying"); then the Knowledge Assistant.
1. **People management** — invite/deactivate employees, assign roles and
   teams, rename (refreshing `ownerName` labels), backed by `people.*` and
   `settings.teams.*` permissions and the real `store.teams`.
2. **SLA and automatic escalation rules** on top of Phase 7's lifecycle and
   escalation data (targets, business hours, breach timers).
3. **Automation execution engine**, once integrations are chosen — only then
   may the Thread emit `automation_execution`.
4. **AI layer** from the product brief (case summary, issue explanation,
   suggested reply), reading the unified Thread.
5. Tech-debt cleanup (each a separate, approved decision): finish the
   Customer → Account migration and the stand-in contact (§6.1–6.2); merge
   the Board popup into `NewCaseDrawer` and `CaseDetailModal` into
   `CaseDetail` (§6.3); validate document URLs; fix the Sidebar nested-link
   warning; decide the stale `lib/*` packages; remove dead pages.
6. **Real persistence** (a database) and production auth hardening before
   anyone outside the team uses it.
7. Back Accounting and Settings with real APIs, or keep them hidden.

---

## 8. Recovery log (2026-09-22)

1. Git initialized; recovery commit `fe6e6e8` is the tree as found.
   `.gitignore` ignores the live `store.json`, tracks `store.snapshot.json`.
2. The inherited Windows `node_modules` was removed and reinstalled on macOS
   with `pnpm install --frozen-lockfile` (pnpm 9.0.0). No versions changed.
3. Four blocking defects fixed (`163dacd`); typecheck from 7 errors to 0.
4. Backend verified by 67 checks, later converted into the Vitest suite.
