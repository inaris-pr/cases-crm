# CLAUDE_HANDOFF.md

**Purpose:** everything a new session needs to resume work without
re-discovering the repository. If you change the architecture, update this
file in the same change.

**Last synchronized with the code:** 2026-09-23, at commit `2e07101`
(documentation-only update on top of it), then updated for **RBAC Phase 1 —
identity foundation** (and its browser-login fix) and **RBAC Phase 2 —
permission core**, **RBAC Phase 3 — backend enforcement** and **RBAC Phase 4 —
stable ownership ids and real team scope** and **RBAC Phase 5 — role-aware
frontend** and **RBAC Phase 6 — personalized role dashboards** and **Phase 7 —
case lifecycle, categories & escalations** (with the unified Case Thread
follow-up). Typecheck clean; **644 tests across 48 files**, all passing;
Playwright 54 tests. Default branch `main`, pushed to the private
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
| RBAC Phase 2 | Permission core: `lib/access` (catalog, scopes, bundles, Account field rules, navigation metadata); `/api/auth/me` reports permissions (§2 Permissions) |
| Login landing fix | Every sign-in lands on the Dashboard; sign-out leaves the protected URL (`cases/src/lib/session.ts`) |
| RBAC Phase 3 | Backend enforcement: a guard on every route, record scope, Account redaction and field groups, case/lead response shaping, private messages and mentions (§2 Enforcement) |
| RBAC Phase 4 | Stable owner/author ids (store v2 migration), real team scope from stored teams, reassignment endpoints (§2 Ownership) |
| RBAC Phase 5 | Role-aware frontend: sidebar, Records tabs, route guard, section and control gating, reassign UI, interim Dashboard; Playwright RBAC suite in CI (§2 Frontend access) |
| RBAC Phase 6 | Personalized role dashboards: `GET /api/dashboard` with permission-gated, scope-computed sections; widget registry by permission; derived case last activity (§2 Dashboards) |
| Phase 7 | Case categories, status history with real closedAt / reopen, resolution time, manual escalations with history; filters and dashboard integration; no migration (§2 Case lifecycle) |
| Phase 7 follow-ups | Category on the Board's New Case popup; the Case Thread as a unified timeline of comments + system activity (§2 Case Thread) |

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
   ├─ access/           Role-based access core     (Phase 2; pure TS, no deps)
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
whole migration if any name matches no employee or more than one.

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
  `GET /api/auth/me` (`{ user, teams, permissions }`).
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
- Roles are enforced by the API from Phase 3 (below).

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

The API re-exports it from `src/access.ts` (relative import, bundled by
esbuild); `/api/auth/me` adds `permissions`. The web app imports only its
types (`@cases/access` tsconfig path) and keeps `permissions` in
`AuthProvider`, unused until Phase 5. **Nothing is enforced yet**:
Phase 3 (below) enforces them.

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
- **Sidebar** ← `visibleNavItems` (Messages entry; Knowledge Base only when
  `VITE_KNOWLEDGE_BASE_URL` is set); the account chip opens `/account`
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
- **Browser tests**: `e2e/` (Playwright, 54 tests, `pnpm test:e2e`) starts its
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
  `Case.updatedAt` untouched, existing sorts unchanged. Limitation: task
  status changes and edits carry no timestamp, so they don't count; and
  `Case.updatedAt` also moves on reassignment. No "stale" threshold — the
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
  survives lead deletion; resolution time / time to close — needs
  `closedAt` or a status history; task completion rates and task
  assignment — need task `assigneeUserId`, `updatedAt`, `completedAt`;
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
- **Priority**: unchanged (`low|medium|high|critical`).
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
- **Deferred**: automatic escalation, SLA deadlines/timers, business-hours
  calendars, state-specific filing timelines, external alerts, chargebacks,
  AI categorization.

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
- Around a case (Phase 7): **CaseStatusEvent** (status history) and
  **CaseEscalation** (§2 Case lifecycle).
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
| Dashboard | Personalized by permission from `GET /api/dashboard` (§2 Dashboards) |
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

`pnpm test`: Vitest + Supertest, **48 files / 644 tests** in
`artifacts/api-server/test/`. Covers stable ownership (v2 migration,
refusal on unmapped/ambiguous names, rename safety, spoofing, history),
team scope and reassignment, authorization (every route declared,
role × route for every role, record scope, redaction, forbidden fields,
case/lead isolation, messages, mentions, B4), the permission core (the approved
matrix cell by cell, resolver, Account field groups and redaction, navigation
and route metadata, `/auth/me` permissions), authentication (passwords, sessions,
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
  shared `NewCaseDrawer`. (Phase 7 follow-up: it does offer the optional
  Category, from the shared `lib/caseMeta.ts` list — keep new Case fields
  in both forms until they are merged.)
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
- **Authorization is enforced by the API** (RBAC Phases 3–4) and reflected
  by the web app (Phase 5).
- **Ownership is by stable employee id** (Phase 4); display names are
  labels. There is no rename feature yet — a future one should also refresh
  the denormalized `ownerName` labels (history names stay as written).
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
(Revision 1) in the Project. Phase 1 (identity foundation), Phase 2
(permission core, `lib/access`), Phase 3 (backend enforcement) and Phase 4
(stable ownership ids, team scope, reassignment) and Phase 5 (role-aware
frontend, Playwright RBAC suite) and Phase 6 (personalized role dashboards)
are done. The next phase starts only after approval.

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
