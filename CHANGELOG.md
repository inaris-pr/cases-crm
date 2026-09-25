# Changelog

All notable changes to this project.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

This file starts at the point the project was brought under version control.
Everything before 2026-09-22 is reconstructed from file timestamps and the
recovered working tree — the project had no repository, so there is no history.

## [Unreleased]

Everything since the recovery release, 2026-09-22 → 2026-09-24.
State at the end of this section: typecheck clean, **619 tests in 47 files**;
Playwright 48 tests.

### Fixed — Phase 7 follow-up: Category on the Board's New Case popup (2026-09-25)
- Records → Cases → Board's own New Case popup now offers the same optional
  Category (options from the shared `lib/caseMeta.ts`), sent through the
  same `POST /api/cases` validation. Everything else about the popup is
  unchanged (account from the selected board card, status pills, fixed
  medium priority, board refresh).
- Tests: 5 API/unit tests (the popup's request shape with a valid, missing,
  null and invalid category; one taxonomy in the web app) and 1 Playwright
  test (create on the Board, reload, category persisted).

### Added — Phase 7: case lifecycle, categories & escalations (2026-09-24)
- **Category**: one optional primary category per Case (10 approved keys,
  e.g. Formation / Filing, EIN / Tax, Customer Dispute — a service dispute,
  not a chargeback). Chosen on New Case (Records, Account and Client
  contexts), edited on Case Detail with `cases.edit`, shown as a chip in the
  table, cards and board, and filterable (`?category=`, incl.
  `uncategorized`). Existing Cases stay uncategorized — nothing is guessed.
- **Lifecycle history**: every status change is recorded append-only with
  the session's employee. Closing (→ Completed) sets `closedAt` and who
  closed it; reopening clears it and keeps the earlier closure in history;
  closing again records a new one. Cases completed before Phase 7 show
  "Closed date unavailable" — never `updatedAt`.
- **Resolution time** on Case Detail for Cases with a known `closedAt`:
  creation → current closure (calendar time), plus the latest cycle when
  reopened. No SLA or business-hours logic.
- **Escalations**: manual, with a reason (refund request, customer dispute,
  incorrect filing, partner issue, deadline risk, customer impact, other)
  and optional note; one active per Case; resolved ones stay in history.
  Escalate with `cases.work`, resolve with `cases.edit`. Banner and history
  on Case Detail; "Escalated" marker in table/cards/board; `?escalated=`
  filter. Priority is unchanged by escalation.
- **Dashboards**: escalated count, an Escalations widget (supervisors also
  see recent escalation activity), category breakdown at team/company
  scope, an Escalated column in workload, and escalations lead "Needs
  attention". Business Advisors and HR receive none of it.
- **No migration**: additive nullable fields and new collections, filled in
  memory on load; store stays at schema v2.
- Tests: 31 API/unit tests added (lifecycle, categories, escalations,
  filters, dashboard scope, taxonomy, pre-Phase-7 store load) and 8
  Playwright tests.

### Added — RBAC Phase 6: personalized role dashboards (2026-09-24)
- **`GET /api/dashboard`**: one server-computed response whose sections
  (cases, calls, leads, accounts, people, communication) are included only
  with their permissions and computed over records in the caller's
  own/team/all scope. Rules shared with the web app in lib/access
  (`DASHBOARD_SECTION_REQUIREMENTS`, `DASHBOARD_WIDGETS`).
- **Dashboard rebuilt as widgets composed by permission**: CSRs and
  Operations Admins see their own case work; supervisors add a per-employee
  workload table (open cases, high/critical, open and overdue tasks);
  Business Advisors see their leads and accounts; BA Supervisors add leads
  by advisor; HR sees employee and team aggregates only; the System Owner
  sees the company. Several roles → the union. Loading skeletons, error
  state with retry (never zeros), empty states.
- **Case last activity** derived from the Case, call/contact logs,
  comments, tasks and documents (`src/caseActivity.ts`) — shown as the
  actual age; never stored; `Case.updatedAt` and existing sorting
  unchanged.
- Only real figures: revenue, commissions, goals, refunds, chargebacks,
  conversions by advisor, resolution time and phone-system volumes are
  deferred until the data exists (list in CLAUDE_HANDOFF.md).
- Tests: 47 API/unit tests (dashboard scopes, sections by role, leakage,
  HR aggregates, workload, breakdowns, task counts, last activity, zeros)
  and 15 Playwright dashboard tests.

### Changed — reproducible browser-suite install (2026-09-24)
- `e2e/package-lock.json` locks `@playwright/test` 1.56.1 and its
  dependencies; CI and `pnpm test:e2e` install it with `npm ci`.

### Added — RBAC Phase 5: role-aware frontend (2026-09-24)
- **The web app shows each employee only what their role permits**, from
  the same lib/access rules the API enforces: the sidebar, Records tabs,
  Accounting tabs (HR: Payroll only), Settings sections (no system
  settings below System Owner; Invite users hidden until the People phase),
  and personal settings in the account menu (`/account`; API Keys for the
  System Owner only). Roles with no access get a "No access has been set up
  for your role yet" screen.
- **Route guard**: a URL the employee may not open shows "You don't have
  access to this page" before the page mounts, so it fetches nothing; the
  API still refuses too.
- **Controls follow record-level permissions**: case edit/work/automation
  controls, lead convert (first Case only with `cases.create`), New
  Lead/Case/Client, Account field editing by field group with redacted
  fields shown as "Restricted", and no case lists, counts or New Case for
  employees without case access.
- **Reassign** replaces owner-name editing: shown only with the assign
  permission, listing only valid targets from the new
  `GET /api/owners/:type/candidates`, sending `{ ownerUserId }`.
- **Interim Dashboard**: case metrics and lists only for roles with them;
  Business Advisors and HR see their real mentions, conversations and (with
  leads) recent leads — no placeholder numbers.
- API: `/auth/me` adds `supervisedUserIds`; `CASES_DATA_DIR` relocates the
  store (used by the browser suite); the scope evaluator moved into
  lib/access (`canOnOwner`), shared by API and web.
- **Playwright RBAC suite** (`e2e/`, 24 tests) runs in CI as its own job,
  against its own API and Vite with a throwaway store.
- Unit tests: `access-controls.test.ts` (controls, sections, guard wiring,
  no owner-by-name writes).

### Security — RBAC Phase 4: stable ownership ids and real team scope (2026-09-24)
- **Ownership and authorship are stable employee ids.** New fields:
  `ownerUserId` (cases, leads, accounts, contacts, automations), `byUserId`
  (call logs), `authorUserId` (comments), `senderUserId` (messages),
  `fromUserId`/`toUserId` (mentions), `memberUserIds` (conversations).
  Every authorization decision uses them; display names are labels, and
  historical names are never rewritten. Renaming an employee changes no
  ownership, authorship or access.
- **Store migration v1 → v2** maps each name to exactly one employee.
  The steps are dry-run on a copy first; any name matching no employee or
  several stops the migration with nothing backed up or written. Backup,
  SHA-256 verification and atomic write as before.
- **Real team scope**: a team-scoped permission covers the caller's own
  records plus those owned by members of the teams they currently
  supervise (stored teams, re-read on every request). This replaces the
  temporary Phase 3 own-only rule; the permission matrix is unchanged.
- **Reassignment**: `PUT /api/{cases|leads|accounts|contacts}/:id/owner`
  with `{ ownerUserId }` — target must exist, be active, be able to view
  that record type, and be inside the caller's assign scope (team never
  crosses teams). `ownerName` in PATCH bodies is now refused
  (`owner_change_requires_reassign`); the Account page's owner field shows
  that error until Phase 5 adds a reassign control.
- `@mentions` resolve against active employees and notify only those who
  may view the case; `/api/team` lists active employees; conversations
  take `memberUserIds` (or exact names); `/stats` and `/cases` accept
  `assigneeUserId`.
- Tests: `ownership-migration.test.ts`, `team-scope.test.ts`,
  `ownership-identity.test.ts`; Phase 1 migration tests pinned to their v1
  step; Phase 3 tests updated where ownership now changes by id.

### Changed — team scope is own-only until Phase 4 (2026-09-24)
- **Temporary Phase 3 safety restriction.** A permission held with scope
  `team` now authorizes only the caller's own records. Record ownership is
  still stored as a display name, and cross-employee authorization must not
  rest on it; Phase 4 introduces stable owner user ids and activates real
  team ownership. The permission matrix is unchanged — supervisors still
  resolve `team` in `/api/auth/me` — and `all` scope is unaffected.
- Effect: Nadia (CSR Supervisor) can no longer edit Devon's or Sara's cases
  (she still views and works every case); Grace (BA Supervisor) no longer
  sees or acts on Leo's leads; team-scoped reassignment reaches only the
  supervisor's own records; `/stats` for a CSR Supervisor covers her own
  cases.
- Tests: "team scope is own-only until Phase 4" in
  `authorization-records.test.ts`; the earlier team-reach assertions were
  replaced by their Phase 3 expectations.

### Security — RBAC Phase 3: backend enforcement (2026-09-24)
- **Every `/api` route now enforces the approved role permissions.** Each
  route declares its access (`publicRoute`, `signedIn`, `allow(...)` in
  `src/auth/authorize.ts`); a missing capability is
  `403 {error: "forbidden", permission}`. A test walks the router and fails
  on any undeclared route.
- **Record scope** (own / team / all) on list and `:id` routes: records
  outside view scope are `404`; visible but outside the action's scope is
  `403 {error: "out_of_scope"}`. Team scope is own-only until Phase 4 (below).
- **Leads**: CSR, Admin and HR get `403` on every `/api/leads*` request;
  Business Advisors see their own leads, BA Supervisors their team's.
- **Cases**: Business Advisors and HR receive no case data anywhere
  (Account/Client/customer responses drop `cases`, `caseCount`,
  `openCaseCount`; case tags and mentions from unviewable cases are hidden).
  CSRs and Admins edit only their own cases but may log calls and comments
  on any case; supervisors edit their team's.
- **Accounts**: sensitive fields are redacted by role wherever an Account
  appears (EIN/FinCEN ID masked, Stripe/banking identifiers omitted, with
  `redactedFields`); edits are checked per field group, and a request
  touching any forbidden field is rejected whole
  (`403 {error: "forbidden_fields", fields}`).
- **Lead conversion**: asking for a first Case without `cases.create` is
  refused and nothing is created; conversion without it works (B4).
- **Messages and mentions**: conversations are readable/writable by members
  only; you can only start conversations you are in; `/mentions` returns
  only your own and you can only mark your own read.
- `/stats` requires `metrics.cases` and is clamped to its scope (own for
  CSR/Admin, team for CSR Supervisor — own-only until Phase 4 — all for Admin
  Supervisor/System Owner).
- The web app is not role-aware yet (Phase 5): for roles other than System
  Owner, some sidebar items and page sections now show errors.
- Tests: `route-guards.test.ts` (router walk, access table, role × route for
  all 9 roles, 401s) and `authorization-records.test.ts` (scope, isolation,
  redaction, field groups, B4, stats, messages, mentions). The mention tests
  in `activity.test.ts` now read each recipient's inbox with their own
  session; `access-auth-me.test.ts`'s "not enforced yet" checks flipped to 403.

### Fixed — sign-in always lands on the Dashboard (2026-09-24)
- **The next sign-in resumed on the page open before sign-out** — even for a
  different employee (Iris signs out on `/leads`, Devon signs in on
  `/leads`). The login screen rendered at whatever URL was open, and signing
  in kept it. Now every successful sign-in clears cached data and lands on
  the Dashboard (`/`); sign-out (or an expired session) clears the cache and
  leaves the protected URL. Reloading while signed in still keeps the
  current page. Rules in `artifacts/cases/src/lib/session.ts`, wired up in
  `lib/auth.tsx`.
- `login-landing.test.ts` (17 tests).

### Added — RBAC Phase 2: permission core (2026-09-24)
- **New workspace package `lib/access` (`@cases/access`)** — the shared,
  dependency-free source of access rules, per plan Revision 1: final role
  keys and labels; the permission catalog with `own`/`team`/`all` scopes;
  role bundles (System Owner = everything; Filing, Filing Supervisor and
  Partner reserved with no permissions); Account field groups with
  sensitive-read rules (masked EIN/FinCEN ID, omitted Stripe and banking
  identifiers) and per-group write rules; Settings, People and System
  permissions; domain-specific Insights permissions; the resolver
  (`resolvePermissions`, `can`, `scopeOf`, `canGrantRole`); navigation and
  route metadata.
- **`GET /api/auth/me` now returns `permissions`** — the signed-in
  employee's effective permissions. The web app stores them (types from
  `@cases/access`) but does not use them yet.
- **Not enforced yet.** Endpoints, navigation and pages behave exactly as
  before for every role; a CSR can still open Leads. Enforcement is Phase 3.
- 5 new test files (78 tests): the approved permission matrix cell by cell,
  catalog/resolver, Account fields and redaction, navigation and routes,
  `/auth/me` permissions and the not-yet-enforced boundary.
- `pnpm-lock.yaml` gains the `lib/access` importer; run `pnpm install` once.

### Fixed — Phase 1 browser login (2026-09-24)
- **Browser login and every write through the Vite dev server returned
  `403 origin_not_allowed`.** Vite 5 expands the `/api` proxy shorthand to
  `{ target, changeOrigin: true }`, which rewrites `Host` to the API's own
  address (`127.0.0.1:3001`) while the browser's `Origin` stays
  `http://127.0.0.1:5173`; the Phase 1 check compared `Origin` with `Host`.
  The check now also accepts an exact list of frontend origins,
  `TRUSTED_FRONTEND_ORIGINS` (default `http://127.0.0.1:5173` and
  `http://localhost:5173`). Foreign origins, wrong ports or schemes, and
  `null` origins are still refused; `X-Forwarded-*` is never trusted;
  `CORS_ALLOWED_ORIGINS` still works. The Vite proxy is now spelled out as
  `{ target, changeOrigin: true }` (same behaviour as before).
- `origin-proxy.test.ts` (11 tests) drives login and writes through a proxy
  that behaves like Vite's, plus the guard with Vite's exact headers.

### Security — RBAC Phase 1: identity foundation (2026-09-24)
- **Every `/api` route now requires a server session** (`401` otherwise),
  except `POST /api/auth/login` and `POST /api/auth/logout`. New
  `GET /api/auth/me` returns the signed-in employee and their teams.
- **Identity comes only from the session.** The `X-User` header no longer
  identifies anyone; `authorName`, `byName` and `senderName` in request
  bodies are accepted but ignored; message deletion checks the real author.
  `GET /api/conversations` always lists only the signed-in employee's
  conversations.
- **Passwords hashed** with Node's built-in scrypt (unique salt,
  constant-time verification); plaintext removed from the store; hashes never
  returned. Deactivated employees cannot sign in and lose their sessions.
- **Server-side sessions**: random token in an HttpOnly, SameSite=Lax cookie
  (Secure over HTTPS), only its hash stored; 8-hour idle / 7-day absolute
  limits as named, validated settings (`src/config.ts`, `.env.example`).
- **Login throttling**: 5 failures per email or 20 per IP in 15 minutes → 429.
- **Network**: CORS same-origin only (opt-in `CORS_ALLOWED_ORIGINS`);
  non-GET requests with a foreign `Origin`/`Referer` → 403; API binds to
  `127.0.0.1` (`API_HOST`); Vite binds to `127.0.0.1` (`VITE_HOST`) and
  proxies to `127.0.0.1` instead of `localhost`.
- **Employee model**: `roles[]`, `departmentKey`, `active`, `demo`,
  `passwordHash`, `mustChangePassword`, `lastLoginAt` (legacy `role` →
  `roles`: `admin` → `system_owner`, `case_manager` → `csr`). Roles are stored
  only; no permission checks yet (Phases 2–3).
- **Demo employees** (password `test123`, flagged `demo`): Nadia Flores (CSR
  Supervisor), Leo Martinez (Business Advisor), Grace Kim (Business Advisor
  Supervisor), Omar Haddad (Admin), Rachel Stein (Admin Supervisor), Tessa
  Nguyen (HR). **Demo teams**: Customer Service, Business Advisors, Operations.
- **Versioned store migrations** (`src/migrations.ts`): verified,
  never-overwriting backup in `data/backups/`, idempotent steps, atomic write;
  any failure — or an unparseable `store.json` — stops startup with the file
  untouched (previously an unreadable file was silently replaced by the seed).
- **Frontend**: session-cookie auth via `/api/auth/me`; no identity in
  `localStorage`; 401 → login screen; logout ends the server session and
  clears cached data; demo credentials listed only in development builds.
- **Tests**: helper `loginAs()` / `authedRequest()` sign in through the real
  endpoint; 63 new tests (passwords, config, throttling, sessions, expiry,
  revocation, spoofing, same-origin, 401 on every route, migration safety and
  idempotency, startup migration, corrupt store).

### Added

#### Automated test suite (`b336b40`)
- Vitest + Supertest in `artifacts/api-server/test/`, started at 104 tests in
  12 files and grown with every change since. Derived from the 67-check
  recovery harness.
- `test/isolation.test.ts` asserts the suite runs in a throwaway directory
  and can never read or write the live `store.json`.
- `pnpm test` at the root and in `@cases/api-server`, plus `test:watch`;
  `tsconfig.test.json`, and the package `typecheck` now covers tests too.

#### Case Automations — management only (`f0a8745` → `9154b0a`)
> Automation **execution is not implemented**. These changes let employees
> create, organize and save workflows; nothing runs them. Execution is
> postponed until the third-party integrations are chosen.
- **Store model** `Automation` (`scope: "case" | "global"`, `caseId`,
  `graph`, `enabled`, `derivedFromAutomationId`, `originCaseId`, audit
  fields) and `normalizeLoaded()`, which back-fills missing collections and
  id counters when an older `store.json` loads (previously a new collection
  would have produced `NaN` ids). One global automation is seeded.
- **API** — `GET/POST /cases/:id/automations`, `GET /automations`,
  `GET/PATCH/DELETE /automations/:id`, `GET /automations/:id/usage`,
  `POST /automations/:id/{promote,fork,revert}`. A case sees its own
  automations plus every global it has not customized, computed at read time.
- **Case Detail → Automations tab** (last tab; `#workflow` alias): selection
  dropdown grouped "This case" / "Global", the visual builder extracted into
  `AutomationBuilder`, named automations, save with viewport, unsaved-change
  guards on automation switch, tab switch and page unload.
- **Scope chosen at creation** — "this case" or "all cases"; a global is
  created in one request after a confirmation.
- **Globals are editable** from any case, with a "Save changes to all
  cases?" confirmation showing how many cases are affected.
- **Apply to all cases** (promote in place), **Customize for this case**
  (fork), **Revert to global** (discard the fork), and **Delete** — a global
  requires typing its name and lists affected and customized cases;
  customized copies survive as independent automations.

#### Contextual case creation (`b73d9f4`)
- One shared New Case form (`NewCaseDrawer`) used by the Cases section,
  Account pages and Client pages.
- From an Account: account fixed, pick one of its contacts (a sole contact is
  pre-selected). From a Client: client fixed, pick one of their accounts (a
  sole account is pre-selected; clients with several companies choose). A
  client with no account can be linked to one inline.
- The contact's email and phone are shown read-only; they are not stored on
  the case.
- `POST /api/cases` now rejects an unknown contact (`unknown_contact`) or a
  contact not actively linked to the account
  (`contact_not_linked_to_account`).

#### Records workspace (`d5c6f86`)
- One **Records** sidebar entry with **Accounts | Clients | Cases** tabs at
  `/records/:tab`, replacing three sidebar entries. Each tab renders the
  existing page and views unchanged.
- `/records`, `/accounts`, `/clients`, `/contacts`, `/customers` and `/cases`
  redirect to the matching tab; detail URLs are unchanged; back links and
  Dashboard links return to the right tab. Routing lives in `lib/records.ts`.

#### Cases table sorting (`35e69ae`)
- **Case #** and **Created** headers cycle ascending → descending → default,
  one column at a time. Default is **Last Modified** (`updatedAt` newest
  first, same as the API). Numeric case-number order, timestamp-based
  Created order, deterministic ties, arrow indicators in the primary colour.
  Table view only; client-side over the filtered results (`lib/caseSort.ts`).

### Changed
- **Removed the standalone Automations page** and its sidebar entry
  (`6514437`); `/workflow` redirects to Records → Cases.
- **`PATCH /api/cases/:id` validates relationships** (`e6a0fe3`) and now
  accepts `accountId`. Rules: account must exist; a new or changed contact
  must exist and be actively linked to the resulting account; moving a case
  away from an account its contact belongs to requires a linked replacement
  or clearing the contact (`primary_contact_not_linked_to_account`). Partial
  updates that leave the relationship alone are unaffected; nothing is
  written on rejection.
- `/api/customers` rows gain `primaryContactId` — the contact whose name the
  row already shows (`5ba4119`).
- Default branch renamed `master` → `main`. `artifacts/api-server` gains
  `vitest`, `supertest`, `@types/supertest` as dev dependencies.

### Fixed
- **Case Detail client link used the Account id** (`979a6f7`). It linked to
  `/clients/{accountId}`, opening the wrong person (e.g. CASE-004 opened
  Robert Chen instead of Sofia Mendoza). Now separate **Client**
  (`primaryContactId`) and **Account** (`accountId`) links; no client link is
  invented for a case without a primary contact.
- **Board (Kanban) links used the Account id as a Contact id** (`5ba4119`) —
  the client card's "Open full portfolio" icon and the board's case modal.
  Company and portfolio now open the Account; the person's name opens their
  Client page.
- Order-dependence in `automations.test.ts` — tests no longer mutate the
  shared seeded global (`878f286`).
- Documentation had recorded "1 conversation" as seed content; the seed
  creates none.

### Documentation
- The server's stand-in `primaryContact` (filled from the account when a case
  has no primary contact) is documented in code and in CLAUDE_HANDOFF.md
  §6.2 (`2e07101`); behaviour unchanged.
- CLAUDE.md, CLAUDE_HANDOFF.md, README.md and this file re-synchronized with
  the repository.

### Known issues
See CLAUDE_HANDOFF.md §6. Highlights: automation execution not implemented;
Customer → Account migration unfinished; stand-in primary contact; the
Board's separate New Case form (no primary contact); duplicated case detail
UI; Last Modified ignores activity (thread, tasks, documents…); table sort
not persisted; JSON-file store, plaintext passwords, no real auth; stale
`lib/*` packages; no CI or component tests.

---

## [0.1.1] — 2026-09-22 — Recovery and stabilization

Brought the project under version control after it was moved from a Windows
machine to a Mac, restored a working toolchain, and fixed the defects that
prevented it from building. **No features, no refactors, no removals.**

### Added
- Git repository. Recovery commit `fe6e6e8` captures the tree exactly as
  found, before any changes.
- `CLAUDE.md`, `CLAUDE_HANDOFF.md`, `CHANGELOG.md`.
- `artifacts/api-server/data/store.snapshot.json` — committed restore point of
  the runtime data as recovered.

### Fixed
- **Lead conversion produced a malformed Account.** `POST /leads/:id/convert`
  built an `Account` with 9 of 46 fields; the remaining 37 were absent rather
  than null, so accounts created by converting a lead rendered as undefined
  across the account detail page. Now routed through the same `makeAccount()`
  helper the seed uses, with the audit fields `POST /accounts` already sets.
  (TS2740 at `routes.ts:794`.)
- **`makeAccount()` specified four keys twice.** `id`, `name`, `ownerName` and
  `createdAt` were assigned and then overwritten by the trailing `...partial`
  spread with identical values. Redundant lines removed; output unchanged.
  (TS2783 ×4 in `store.ts`.)
- **Null email crashed two search filters.** The Kanban board's client picker
  and the Customers search called `.toLowerCase()` on `Customer.email`, which
  is `string | null` — an account with no linked contact made either search box
  throw. Now `(c.email ?? "")`, matching the adjacent `company` handling.
  (TS18047 ×2.)
- **Cases "Cards" view could render empty.** The shared cases query was enabled
  only for the table view, so changing a filter while in Cards produced a query
  key that never fetched. Now enabled for every view except the board, which
  fetches its own data.

### Changed
- `.gitignore` rewritten: grouped and commented; added `*.tsbuildinfo`,
  `.env.*.local`, `Thumbs.db`, `_tmp_3_*`; replaced the blanket `data/` rule
  with a precise pair that ignores the live `store.json` while tracking the
  snapshot.
- `README.md` corrected — it claimed the store resets on every restart (it has
  persisted to JSON for some time), understated the seed by roughly 3×, gave
  PowerShell instructions and a Windows path, and described the Postgres swap
  as a one-file change when `lib/db` models a retired schema.
- `makeAccount()` is now exported from `store.ts`.

### Removed
- The inherited Windows `node_modules` (278 MB, carrying `@esbuild/win32-x64`
  and two `rollup-win32` packages). Reinstalled on macOS from the existing
  lockfile with `--frozen-lockfile`; **no package versions changed.**

### Verified
- `tsc --noEmit` clean across `api-server`, `cases` and `lib/db` — from 7
  errors to 0.
- 67 API-level checks pass against a booted server running on an isolated copy
  of the data: login and rejection, stats, team, leads and filters, lead
  conversion (all 46 fields, audit fields, linked contact, initial case,
  409 on re-conversion), accounts, contacts and multi-account resolution,
  cases with every filter, case detail, tasks, documents, interactions, thread,
  mentions, messages incl. soft delete and author check, and error handling.
- The live `store.json` was never written to during any of this.

### Known issues carried forward
Unchanged and deliberately untouched: the unfinished Customer → Account
migration and its load-bearing compatibility shim; three dead page files; two
duplicated UI implementations; stale `lib/db`, `lib/api-spec` and ungenerated
`lib/api-client-react`; plaintext passwords with no real auth; zero automated
tests. See `CLAUDE_HANDOFF.md` §6.

---

## [0.1.0] — 2026-05-14 — State as recovered

Reconstructed from file timestamps; never committed at the time.

### Added (2026-05-13 → 05-14)
- Account / Contact / AccountContactLink / Lead data model replacing the flat
  `Customer` record, with a Salesforce-style ~46-field account record.
- Lead pipeline with conversion to Account + Contact + Link + optional case.
- Accounts list and detail with inline editing; Clients list and contact detail.
- Cases in table, cards and Kanban board views; case detail with overview,
  interactions, thread, tasks and documents.
- Team messaging: DMs, groups, case tagging, `@mention` inbox.
- Dashboard and Insights off a live stats endpoint.
- JSON file persistence for the in-memory store.
- Prototype-only Accounting, Automations and Settings pages (local state, no
  backend).

### Changed
- "Contacts" renamed to "Clients" in navigation and routes, with legacy
  aliases retained. This was the last change made before work stopped.
