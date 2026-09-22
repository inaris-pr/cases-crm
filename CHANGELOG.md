# Changelog

All notable changes to this project.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

This file starts at the point the project was brought under version control.
Everything before 2026-09-22 is reconstructed from file timestamps and the
recovered working tree — the project had no repository, so there is no history.

## [Unreleased]

### Added
- **Automated API test suite** — Vitest + Supertest, **104 tests across 12
  files** in `artifacts/api-server/test/`, derived from the 67-check
  verification harness written during recovery. Covers auth, stats and team, leads, lead conversion
  (a dedicated regression suite for the malformed-Account defect), accounts,
  contacts and account-contact links, cases and every filter, case detail,
  tasks, documents, interactions, thread, mentions, messages, the legacy
  `/customers` projection, and the validation/404 contracts.
- `test/isolation.test.ts`, which asserts the suite's own safety properties:
  it runs from a throwaway working directory, writes its store there, cannot
  reach `artifacts/api-server/data/store.json`, and starts every file from the
  deterministic seed.
- `pnpm test` at the root and in `@cases/api-server`, plus `test:watch`.
- `artifacts/api-server/tsconfig.test.json`; the package's `typecheck` script
  now covers the test sources as well as `src/`.

### Changed
- Default branch renamed `master` → `main`.
- `artifacts/api-server` gains `vitest`, `supertest` and `@types/supertest` as
  dev dependencies. No production dependency changed.

### Fixed
- Documentation had recorded "1 conversation" as seed content (and the README
  "a team message thread"). Both were read off the runtime `store.json` rather
  than the seed: `store.ts` creates **no** conversations or messages, because
  its only `conversations.push()` is inside the never-called
  `findOrCreateDm()`. Corrected in `CLAUDE_HANDOFF.md`, `README.md` and
  `CLAUDE.md`.

### Notes
- `POST /api/conversations` never calls the `findOrCreateDm()` helper that
  `store.ts` exports, so duplicate DMs between the same two people are
  reachable. The suite **pins this existing behaviour** rather than changing
  it; fixing it is a deliberate decision, not a cleanup.
- The test app helper duplicates the error handler from `src/index.ts`.
  Removing the duplication needs a production refactor (`createApp()`), which
  was out of scope.
- Feature development remains paused pending review.

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
