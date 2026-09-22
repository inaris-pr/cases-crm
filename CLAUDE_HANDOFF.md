# CLAUDE_HANDOFF.md

**Purpose:** everything a new session needs to resume work without
re-discovering the repository. Written 2026-09-22, after the recovery and
stabilization pass. If you change the architecture, update this file.

**Status at time of writing:** recovered, stabilized, typecheck clean, backed
up to a private GitHub remote, and covered by an automated API test suite.
Feature development has **not** resumed. The default branch is `main`.

---

## 1. How the project got here

Development happened on a **Windows** machine between 2026-05-13 and
2026-05-14, then stopped. The last app *run* was 2026-05-26. The folder was
moved to a **Mac** (`~/Desktop/APPS/CRM/cases-app`) and picked up again on
2026-09-22.

It had **never been under version control** — no repo, no remote, no history.
The recovery commit `fe6e6e8` is the working tree exactly as found; everything
before it is unrecoverable.

Work stopped **mid-migration**, which explains most of what looks odd: the
original model was a flat `Customer`, and it was being replaced by
`Account` + `Contact` + `AccountContactLink` + `Lead`. The new model is live
and working. The old one was never removed.

---

## 2. Architecture

pnpm workspace, TypeScript throughout, ~16k lines of source.

```
cases-app/
├─ artifacts/
│  ├─ cases/         React 19, Vite 5, Tailwind v4-beta, Framer Motion,
│  │                 Wouter, TanStack Query v5, Recharts, Lucide
│  └─ api-server/    Node 20+, Express 5, Zod, Pino; tsx in dev, esbuild to build
└─ lib/
   ├─ db/               Drizzle + postgres-js      (stale, unused)
   ├─ api-spec/         OpenAPI 3.1 YAML           (stale)
   └─ api-client-react/ Orval output               (never generated)
```

### Persistence

There is **no database**. `api-server/src/store.ts` holds thirteen in-memory
arrays plus an id-sequence object. A router-level hook persists the entire
store to `artifacts/api-server/data/store.json` (debounced 100 ms) after every
successful non-GET request. On boot, `loadFromDisk()` rehydrates from that file
unless one of two schema guards fires, in which case the demo seed re-runs.

Seed contents: 17 accounts, 21 contacts, 23 links, 8 leads, 15 cases, 65 tasks,
12 documents, 15 interactions, 14 thread entries, 3 users — and **no
conversations or messages**; the only `conversations.push()` in `store.ts`
sits inside the never-called `findOrCreateDm()`, so every conversation in a
running install was made through the UI. All fictional — invented companies,
EINs, filing IDs, `example.com` URLs.

`store.snapshot.json` (committed) is a restore point taken 2026-09-22.

### Auth — effectively none

`POST /api/auth/login` compares **plaintext** passwords in the store and
returns the user object. The frontend keeps it in `localStorage` under
`cases.auth.user` and sends an `X-User: <name>` header, which the server
trusts as identity. **No tokens, no sessions, no route protection** — every
endpoint is open to an unauthenticated caller. Fine for a local prototype;
a blocker for anything else.

### Domain model

- **Account** — a company. ~46 fields modelled on a Salesforce-style entity
  formation record: Portal ID, Filing ID, EIN, FinCEN ID + filing date,
  formation status/tier/date, brand, subscription bundle, Stripe IDs, share
  structure, renewal status/date, principal + mailing `Address`, banking
  application id/status/message, plus created/modified audit fields.
- **Contact** — a person. Not owned by an account.
- **AccountContactLink** — many-to-many join carrying `role`, `ownershipPct`,
  `isPrimary`, `isSignatory`, `startedAt`, `endedAt`. One contact can sit on
  many accounts (the seed's Hassan Patel is on three).
- **Lead** — pre-qualification record; person and company data on one row.
  `POST /leads/:id/convert` atomically creates Account + Contact + Link and
  optionally a first Case, then marks the lead converted.
- **Case** — hangs off an Account with an optional primary Contact. Status
  (`intake|review|in_progress|waiting|completed`), priority
  (`low|medium|high|critical`), tags, owner.
- Around a case: **Task**, **Doc**, **CaseInteraction** (logged call/email/
  meeting), **CaseThreadEntry** (internal comment), **Mention** (parsed from
  `@Name` in a thread entry, feeds the alerts inbox).
- **Conversation / Message** — team chat, DMs and groups, messages taggable
  with case ids, soft delete.

### API

41 routes under `/api`. Auth; cases; accounts; contacts; account-contacts;
leads incl. convert; tasks; documents; `cases/:id/contacts`; `cases/:id/thread`;
mentions incl. mark-read; team; stats; conversations + messages; and a
`/customers` backwards-compatibility shim.

---

## 3. What works

Verified 2026-09-22 by 67 API-level checks against a booted server.

| Area | State |
|---|---|
| Login + session gate | Works (insecure as described above) |
| Dashboard | Live stats, recent cases, tasks, 30-day trend |
| Leads | List, filter, create, edit, delete, convert |
| Lead → Account/Contact conversion | Works, incl. optional initial case; re-conversion returns 409 |
| Accounts | List with rollups, search, detail with ~46 inline-editable fields |
| Clients (Contacts) | List/cards, create, detail with linked accounts + cases |
| Cases | Table, Cards, Board (Kanban); filters by status/priority/search/assignee |
| Case detail | Overview, Contacts, Thread, Tasks, Documents (+ a stub Workflow tab) |
| Mentions | `@Name` parsed server-side, unread inbox in the messages widget |
| Messages | DMs, groups, case tagging, soft delete with author check |
| Insights | Charts off `/stats` and `/cases`, per-assignee filter |

**UI rendering has not been verified in this pass** — only the API beneath it.

### Test coverage

`pnpm test` runs Vitest + Supertest over the API: 12 files in
`artifacts/api-server/test/` covering auth, stats, leads, lead conversion,
accounts, contacts and links, cases and every filter, case detail, tasks,
documents, interactions, thread, mentions, messages, the legacy `/customers`
projection, and the validation/404 contracts.

Isolation is enforced, not assumed: `test/setup.ts` chdirs into a temp
directory before the store module loads, so the suite cannot touch
`artifacts/api-server/data/store.json`, and `test/isolation.test.ts` asserts
that it doesn't. The vitest pool is `forks` because `process.chdir()` throws in
worker threads.

**There is no frontend test coverage.** The React app is untested.

## 4. What is prototype-only

Local `useState` with hardcoded arrays. No backend, nothing persists, nothing
executes. They look finished; they are not.

- **Accounting** (758 lines) — ledger, trial balance, balance sheet, P&L, cash
  flow, payroll + paystub modal. All from `SEED_LEDGER` constants.
- **Automations / Workflow** (623 lines) — node/edge canvas with drag, pan and
  connect. `INITIAL_NODES` in state. The case-level Workflow tab is a static
  empty state linking here.
- **Settings** (938 lines) — invites, divisions & teams, pipeline stages,
  company config (logo, theme).

## 5. Not started

Nothing in the codebase references Anthropic, OpenAI, or any LLM. The AI
layer from the product brief — case summaries, issue explanation, suggested
replies — does not exist. Also absent: client-facing comments (the thread is
employees-only), real file upload (documents are URL references), and email or
telephony ingestion (interactions are logged by hand).

---

## 6. Technical debt — known, deliberate, not to be "cleaned up" unasked

### 6.1 The unfinished Customer → Account migration

The single largest source of confusion.

- `caseWithRelations()` in `routes.ts` synthesizes a fake flat `customer`
  object and a deprecated `customerId` on **every** case it returns.
- `GET /api/customers` and `/api/customers/:id` map Accounts into the legacy
  shape via `legacyCustomerView()`.
- **Still load-bearing:** `CasesBoard.tsx` (client picker) and the New Case
  drawer in `CasesList.tsx` both read `/api/customers`. The shim cannot simply
  be deleted.
- `App.tsx` keeps `/customers` and `/contacts` route aliases pointing at the
  new pages.

### 6.2 Dead files

Unrouted and imported by nothing. Left in place deliberately:

- `pages/Customers.tsx` (180 lines) — superseded by `Clients.tsx`
- `pages/Contacts.tsx` (143 lines) — earlier version of `Clients.tsx`
- `pages/ClientPortfolio.tsx` (130 lines) — superseded by `ContactDetail.tsx`

### 6.3 Duplicated UI

- `pages/CaseDetail.tsx` (887) and `components/CaseDetailModal.tsx` (781) are
  two implementations of the same screen, each with its own Overview / Contacts
  / Thread / Documents tabs. The modal opens from the Kanban board, the page
  from `/cases/:id`. The modal has **no Tasks tab**. They will drift.
- `components/layout/MessagesWidget.tsx` (998) and `pages/Messages.tsx` (394)
  substantially overlap. The widget is on every page; `/messages` is routed but
  absent from the sidebar.

### 6.4 The three lib packages are lying

- **`lib/api-spec/openapi.yaml`** documents 10 paths from the pre-Account era
  (cases, customers, tasks, documents, stats, conversations, messages). It has
  no accounts, contacts, links, leads, interactions, thread, mentions, team or
  auth — roughly 75% of the real API is undocumented, and what it does document
  uses the retired model.
- **`lib/api-client-react/src/index.ts`** is `export {}`. Orval has never run.
  Running `pnpm api:generate` today would generate a client for the stale spec
  and is worse than doing nothing.
- **`lib/db/src/schema.ts`** defines only `customers`, `cases`, `tasks`,
  `documents`, `conversations`, `conversation_members`, `messages`,
  `message_case_tags`. Missing: accounts, contacts, account_contact_links,
  leads, users, case_interactions, thread_entries, mentions. No migrations have
  ever been generated. The README's old claim that switching to Postgres is a
  "one-file change" was false and has been corrected.

### 6.5 Smaller items

- **Identity is passed two ways** — `X-User` header *and* `authorName` /
  `byName` / `senderName` in bodies, depending on the route. Both are required
  where used. Unify deliberately or not at all.
- **Types are duplicated** between `api-server/src/store.ts` and
  `cases/src/lib/api.ts` with no shared package. They must be edited together.
- **Plaintext passwords** in the store and in the seed source.
- **`POST /accounts` inlines all ~46 fields** rather than using `makeAccount()`.
  Correct, just verbose; left alone as an unrelated refactor.
- **Tailwind v4 is a beta** (`4.0.0-beta.6`); esbuild is pinned to `0.21.5` by
  a root `pnpm.overrides` entry to avoid a multi-version postinstall failure.
- **`findOrCreateDm()` in `store.ts` is exported but never called.**
  `POST /conversations` always inserts a new row, so two DMs between the same
  pair are reachable from the UI. `messages.test.ts` pins the current
  behaviour with a comment saying so; wiring the helper up would be a
  deliberate behaviour change, not a cleanup.
- **The test app helper duplicates `index.ts`'s error handler.** Extracting a
  shared `createApp()` would remove the copy but is a production refactor and
  has not been done. Until then the two must be changed together.
- **No frontend tests and no CI.** The API suite exists; nothing runs it
  automatically, and nothing covers the React app.
- Four stray zero-byte `_tmp_3_*` files from the machine transfer; now ignored.

---

## 7. Recovery log (2026-09-22)

1. **Git initialized.** Recovery commit `fe6e6e8` — 70 files, the tree as
   found, no code changes. `.gitignore` rewritten: grouped, plus
   `*.tsbuildinfo`, `.env.*.local`, `Thumbs.db`, `_tmp_3_*`, and a precise pair
   that ignores the live `store.json` while tracking `store.snapshot.json`.
   Verified before committing that no `node_modules`, `.env`, `dist` or live
   store file was staged.
2. **macOS dependency reinstall.** The inherited `node_modules` (278 MB) was a
   Windows install carrying `@esbuild/win32-x64` and two `rollup-win32`
   packages — unusable on macOS. Removed, then reinstalled with
   `pnpm install --frozen-lockfile` under pnpm 9.0.0; the lockfile already
   carried `@esbuild/darwin-arm64@0.21.5` and
   `@rollup/rollup-darwin-arm64@4.60.3`. **No package versions changed.**
3. **Four defects fixed** — commit `163dacd`, see CHANGELOG.md. Typecheck went
   from 7 errors to clean.
4. **Backend verified** — 67 checks, all passing.
5. **Documentation written** — this file, CLAUDE.md, README.md, CHANGELOG.md.

---

## 8. Recommended next work, in order

Nothing below has been started. Items 1–3 are cheap and reduce risk sharply.

1. **CI.** The API suite exists but nothing runs it on push. A GitHub Actions
   workflow doing `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`
   is an afternoon, and it makes every later item safer.
2. **Frontend test coverage.** The React app — 12k lines, including the two
   duplicated case-detail implementations — has none.
3. **Finish the Customer → Account migration.** Point `CasesBoard.tsx` and the
   New Case drawer at `/api/accounts`, then delete `legacyCustomerView()`, the
   `/customers` routes, the synthesized `customer` object, `customerId`, and
   the three dead page files. Self-contained, and it removes a whole category
   of confusion.
4. **Consolidate the duplicated case UI.** Extract the shared tabs from
   `CaseDetail.tsx` and `CaseDetailModal.tsx`; have the modal render the page's
   components. ~1,670 lines becomes roughly half that.
5. **Decide the fate of `lib/db`, `lib/api-spec`, `lib/api-client-react`.**
   Either refresh all three against the real model or delete them. Leaving
   stale ones in place is worse than either.
6. **Real persistence.** The JSON store will not survive concurrent users. If
   Postgres is the destination, `lib/db` needs rewriting first (item 4).
7. **Real auth** before this is reachable by anyone but its author.
8. **The AI layer** from the product brief — case summarization, issue
   explanation, suggested customer replies.
9. **Back the prototype pages with real APIs** — Accounting, Automations,
   Settings — or remove them from the nav until they are real.
