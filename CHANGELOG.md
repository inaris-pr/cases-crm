# Changelog

All notable changes to this project.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

This file starts at the point the project was brought under version control.
Everything before 2026-09-22 is reconstructed from file timestamps and the
recovered working tree — the project had no repository, so there is no history.

## [Unreleased]

Everything since the recovery release, 2026-09-22 → 2026-09-24.
State at the end of this section: typecheck clean, **432 tests in 34 files**.

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
