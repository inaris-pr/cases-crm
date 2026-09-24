# CLAUDE_HANDOFF.md

**Purpose:** everything a new session needs to resume work without
re-discovering the repository. If you change the architecture, update this
file in the same change.

**Last synchronized with the code:** 2026-09-23, at commit `2e07101`
(documentation-only update on top of it), then updated for **RBAC Phase 1 —
identity foundation**. Typecheck clean; **325 tests across 27 files**, all
passing. Default branch `main`, pushed to the private
remote `inaris-pr/cases-crm`.

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

Since recovery (all 2026-09-22/23, see CHANGELOG.md):

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

---

## 2. Architecture

pnpm workspace, TypeScript throughout, ~17k lines of source
(frontend ~14k, API ~3.3k).

```
cases-app/
├─ artifacts/
│  ├─ cases/         React 19, Vite 5, Tailwind v4-beta, Framer Motion,
│  │                 Wouter, TanStack Query v5, Recharts, Lucide
│  └─ api-server/    Node 20+, Express 5, Zod, Pino; tsx in dev, esbuild to build
└─ lib/
   ├─ db/               Drizzle + postgres-js      (stale, unused)
   ├─ api-spec/         OpenAPI 3.1 YAML           (stale)
   └─ api-client-react/ Orval target               (never generated)
```

### Persistence

There is **no database**. `api-server/src/store.ts` holds **sixteen**
in-memory arrays (including `teams` and `sessions`), a `meta.schemaVersion`
and an id-sequence object. A router-level hook persists the
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
means adding one line to `COLLECTION_SEQ`.

**Versioned migrations** (`src/migrations.ts`, from RBAC Phase 1): the store
records `meta.schemaVersion` (currently 1). When `store.json` is behind,
startup copies it byte-for-byte to
`data/backups/store.pre-v<N>.from-v<M>.<timestamp>.json` (exclusive create,
never overwriting), re-reads the copy and compares SHA-256 with the source,
checks the source did not change meanwhile, runs the ordered idempotent steps
in memory, and writes the result atomically (temp file + rename). Any failure
throws `MigrationAbortError` and startup stops with `store.json` untouched. A
`store.json` that exists but is not valid JSON also stops startup rather than
being replaced by the seed. Step v1 (identity foundation) hashes passwords,
maps legacy roles, adds user flags, and adds the demo employees and teams.

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
  Business Advisors (Leo; Grace), Operations (Omar; Rachel). Stored only —
  team scope arrives in Phase 4.
- **Passwords**: scrypt via Node's `crypto` (unique 16-byte salt, constant-time
  comparison; `src/auth/password.ts`). Never returned by any endpoint.
- **Sessions** (`src/auth/sessions.ts`): random 256-bit token in an
  HttpOnly, SameSite=Lax cookie `cases_session` (Path `/api`; `Secure` over
  HTTPS); only its SHA-256 is stored. Ends after 8 h idle or 7 days, on
  logout, or when the employee is deactivated.
- **Endpoints**: `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me` (`{ user, teams }`).
- **Every other `/api` route requires a session** (`401 unauthenticated`).
  Identity comes only from the session; `X-User` and body names
  (`authorName`, `byName`, `senderName`) are ignored.
- **Throttling**: 5 failed logins per email / 20 per IP in 15 minutes → `429`.
- **Network**: same-origin only (no CORS headers unless
  `CORS_ALLOWED_ORIGINS`), non-GET requests from a foreign `Origin` → `403`,
  API bound to `127.0.0.1`, Vite bound to `127.0.0.1` and proxying to it.
- **Frontend**: `AuthProvider` asks `/api/auth/me`; nothing identity-related
  is kept in `localStorage`; any `401` returns to the login screen; logout
  ends the server session and clears cached data.
- **Not yet**: roles do not restrict anything — every signed-in employee can
  still use every endpoint (Phases 2–3).

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
  `low|medium|high|critical`; tags; owner; `createdAt`, `updatedAt`.
- Around a case: **Task**, **Doc**, **CaseInteraction**, **CaseThreadEntry**,
  **Mention**.
- **Automation** — a saved visual workflow graph, scoped `case` or `global`
  (§3.1).
- **Conversation / Message** — team chat.

**Account ids and Contact ids are independent sequences.** The same number
names unrelated records (account #6 is Mendoza Architecture; contact #6 is
Robert Chen). Never use one where the other belongs — see §3.4.

### API

**53 routes** under `/api`: auth (login, logout, me); cases (list/filters, create, detail,
update); accounts; contacts; account-contacts; leads incl. convert; tasks;
documents; `cases/:id/contacts`; `cases/:id/thread`; mentions; team; stats;
conversations + messages; **automations** (10 routes, §3.1); and the
`/customers` compatibility shim (§6.1).

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
alias for `accountId`.

### 3.3 Consolidated Records workspace

- Sidebar: Dashboard, Leads, **Records**, Accounting, Insights, Settings.
  Records replaces the separate Accounts / Clients / Cases entries and stays
  highlighted on any records list or detail URL.
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
| Login + session gate | Works (insecure, §2) |
| Dashboard | Live stats, recent cases, tasks, 30-day trend |
| Leads | List, filter, create, edit, delete, convert |
| Records → Accounts | List, search, detail with ~46 inline-editable fields, contacts, cases, New Case |
| Records → Clients | List/cards, create, detail with linked accounts and cases, New Case |
| Records → Cases | Table (sortable), Cards, Board; filters by status / priority / search / assignee |
| Case detail | Overview, Contacts, Thread, Tasks, Documents, Automations; Client and Account links |
| Case automations | Management as in §3.1; **no execution** |
| Mentions | `@Name` parsed server-side, unread inbox in the messages widget |
| Messages | DMs, groups, case tagging, soft delete with author check |
| Insights | Charts off `/stats` and `/cases` |

### Test coverage

`pnpm test`: Vitest + Supertest, **27 files / 325 tests** in
`artifacts/api-server/test/`. Covers authentication (passwords, sessions,
expiry, revocation, throttling, spoofing, same-origin, the 401 on every route),
the store migration, and the API end to end (stats, leads,
conversion, accounts, contacts, links, cases incl. filters, create and update
validation, tasks, documents, interactions, thread, mentions, messages,
automations incl. scopes/fork/revert/delete, store migration, the `/customers`
projection) plus three **pure frontend modules** imported directly:
`lib/records.ts`, `lib/caseLinks.ts`, `lib/caseSort.ts`.

Isolation is enforced: `test/setup.ts` chdirs into a temp directory before the
store loads, so the suite cannot touch the live `store.json`
(`test/isolation.test.ts` asserts it). Pool is `forks`.

**No React component is tested and there is no CI.** UI changes need a browser.

---

## 5. Prototype-only and not started

**Prototype-only** (local `useState`, hardcoded data, nothing persists):
- **Accounting** (758 lines) — ledger, statements, payroll, all from constants.
- **Settings** (938 lines) — invites, divisions/teams, pipeline stages,
  company config.

**Not started:**
- **Automation execution** (see §3.1).
- **AI layer** — case summaries, issue explanation, suggested replies. Nothing
  references any LLM.
- Client-facing comments (the thread is employees-only), real file upload
  (documents are URL references), email/telephony ingestion (interactions
  are logged by hand).

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

- `pages/CaseDetail.tsx` (956) and `components/CaseDetailModal.tsx` (783) are
  two implementations of the case screen. The modal (opened from the Board)
  has Overview, Contacts, Documents and Thread only — **no Tasks and no
  Automations**.
- **Duplicate case creation on the Board:** `NewCaseModalForClient` in
  `CasesBoard.tsx` is a separate form. It posts `customerId` only, so cases
  created from the Board **never get a primary contact**, and it bypasses the
  shared `NewCaseDrawer`.
- `components/layout/MessagesWidget.tsx` (998) and `pages/Messages.tsx` (394)
  overlap; `/messages` is routed but not in the sidebar.

### 6.4 Dead files

Unrouted and imported by nothing: `pages/Customers.tsx` (still links to
`/clients/{accountId}` — unreachable), `pages/Contacts.tsx`,
`pages/ClientPortfolio.tsx`.

### 6.5 The three lib packages are stale

- `lib/api-spec/openapi.yaml` documents ~11 paths from the pre-Account era.
  No accounts, contacts, links, leads, interactions, thread, mentions, team,
  auth or automations.
- `lib/api-client-react` exports nothing; Orval has never run. **Do not run
  `pnpm api:generate`.**
- `lib/db/src/schema.ts` models only the retired tables (customers, cases,
  tasks, documents, conversations, members, messages, message tags). No
  accounts, contacts, links, leads, users, interactions, thread, mentions or
  automations; no migrations.

### 6.6 Data and auth

- **JSON-file store**: single process, whole-file rewrites, no transactions,
  no concurrent-user safety.
- **Authentication exists, authorization does not yet**: any signed-in
  employee can call any endpoint (RBAC Phases 2–3).
- **Ownership is still by display name** (`ownerName`, `authorName`, …);
  stable user ids arrive in Phase 4. `TEAM_MEMBERS` (owner pickers, mention
  parsing) still lists only Iris, Devon and Sara.
- **Demo credentials**: every employee uses `test123`; the login page lists
  them in development builds. Sessions and login throttling are in-process.
- **Not production-grade**: no SSO/MFA, no password change or reset UI, no
  audit log yet.
- **Types duplicated** between `api-server/src/store.ts` and
  `cases/src/lib/api.ts`; edit together.

### 6.7 Behaviour limits

- **Last Modified ≠ last activity.** `Case.updatedAt` changes only on create
  and `PATCH /cases/:id` (and on any PATCH, even one that changes nothing).
  Thread entries, interactions, tasks, documents, case contacts and
  automation edits do **not** touch it, so the default table order reflects
  edits to the case record, not activity.
- **Sort preference is not persisted.** It lives in `CasesList` state: kept
  while switching Table / Cards / Board, reset by leaving the Cases tab,
  navigating away or reloading. Not in the URL.
- **Automation delete safeguard is UI-only** (§3.1).
- `findOrCreateDm()` is never called; duplicate DMs are reachable (pinned by
  `messages.test.ts`).

### 6.8 Smaller items

- `POST /accounts` inlines all ~46 fields rather than using `makeAccount()`.
- Tailwind v4 is a **beta** (`4.0.0-beta.6`); esbuild pinned to `0.21.5` by a
  root override.
- `test/helpers/app.ts` duplicates `index.ts`'s error handler.
- Stale code comments: the header comment of `CaseAutomationsTab.tsx` still
  says scope actions "arrive in a later stage" and globals are read-only
  (both are implemented/changed); the comment above `legacyCustomerView()`
  still mentions a `/customers` page.
- Two zero-byte `_tmp_3_*` files from the machine transfer, git-ignored.

---

## 7. Recommended next work

**In progress: role-based access** — see `role-based-access-plan.md`
(Revision 1) in the Project. Phase 1 (identity foundation) is done; next are
Phase 2 (permission core, `lib/access`), Phase 3 (backend enforcement),
Phase 4 (stable user ids, teams, reassignment) and Phase 5 (frontend
navigation and gating). Personalized dashboards follow only after those.

1. **CI** — `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`
   on push.
2. **Frontend tests** for at least the case screens and Records.
3. **Finish the Customer → Account migration and remove the stand-in contact**
   (§6.1, §6.2) — including pointing the Board and the global New Case form
   at `/api/accounts`, and replacing `NewCaseModalForClient` with the shared
   `NewCaseDrawer` (§6.3).
4. **Consolidate `CaseDetail` and `CaseDetailModal`.**
5. **Decide `lib/db`, `lib/api-spec`, `lib/api-client-react`** — refresh or
   delete.
6. **Real persistence and real auth** before anyone but the author uses it.
7. **Automation execution**, once integrations are chosen.
8. **The AI layer** from the product brief.
9. Back Accounting and Settings with real APIs, or hide them.

---

## 8. Recovery log (2026-09-22)

1. Git initialized; recovery commit `fe6e6e8` is the tree as found.
   `.gitignore` ignores the live `store.json`, tracks `store.snapshot.json`.
2. The inherited Windows `node_modules` was removed and reinstalled on macOS
   with `pnpm install --frozen-lockfile` (pnpm 9.0.0). No versions changed.
3. Four blocking defects fixed (`163dacd`); typecheck from 7 errors to 0.
4. Backend verified by 67 checks, later converted into the Vitest suite.
