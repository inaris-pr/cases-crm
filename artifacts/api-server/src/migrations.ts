/**
 * Versioned, idempotent migrations for the persisted store (store.json).
 *
 * The store records `meta.schemaVersion`. On startup store.ts reads the file
 * and hands it to migrateStoreFile(), which — only when the file is behind:
 *
 *   1. writes a byte-for-byte backup with exclusive creation (an existing
 *      backup is never overwritten),
 *   2. re-reads the backup and checks its SHA-256 against the bytes it read,
 *      and checks the live file has not changed meanwhile — on any mismatch it
 *      throws MigrationAbortError and nothing is written,
 *   3. runs the pending steps, in order, on the parsed data in memory,
 *   4. writes the result atomically (temp file + rename), so there is never a
 *      half-written store.
 *
 * Before step 1 the pending steps are DRY-RUN on a deep copy; if any step
 * would fail (e.g. an owner name that maps to no employee), nothing is
 * backed up or written and startup stops with the reasons.
 *
 * Every step is itself idempotent (it checks before it changes), and the
 * version gate means a migrated file is never touched again. Nothing here
 * imports store.ts, so it can run on any file — which is how the tests drive it.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { hashPasswordSync, isPasswordHash } from "./auth/password.js";
import {
  DEMO_EMPLOYEES,
  DEMO_PASSWORD,
  DEMO_TEAMS,
  DEPARTMENT_FOR_ROLE,
  LEGACY_ROLE_MAP,
  isRoleKey,
  type RoleKey,
} from "./auth/identity.js";

export const CURRENT_SCHEMA_VERSION = 2;

export class MigrationAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationAbortError";
  }
}

// The migration works on the raw parsed JSON, whose shape is by definition
// older than the current types.
type Data = Record<string, any>;

export function schemaVersionOf(data: Data): number {
  const v = data?.meta?.schemaVersion;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

export function needsMigration(data: Data, targetVersion: number = CURRENT_SCHEMA_VERSION): boolean {
  return schemaVersionOf(data) < targetVersion;
}

export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function ensureArray(data: Data, key: string): any[] {
  if (!Array.isArray(data[key])) data[key] = [];
  return data[key];
}

/** Next id for a collection, never colliding with an id already present. */
function nextIdIn(data: Data, collection: string, seqKey: string): number {
  data.seq = data.seq && typeof data.seq === "object" ? data.seq : {};
  const rows = ensureArray(data, collection);
  const highest = rows.reduce(
    (max: number, row: any) => (typeof row?.id === "number" && row.id > max ? row.id : max),
    0,
  );
  const current = typeof data.seq[seqKey] === "number" && Number.isFinite(data.seq[seqKey]) ? data.seq[seqKey] : 0;
  const next = Math.max(highest, current) + 1;
  data.seq[seqKey] = next;
  return next;
}

function sameEmail(a: unknown, b: string): boolean {
  return typeof a === "string" && a.trim().toLowerCase() === b.toLowerCase();
}

// ── Step helpers (also used by the fresh seed, so both paths agree) ─────────

/**
 * Adds each demo employee whose email is not already in use. Existing users
 * — including one that already has a demo email — are never modified.
 * Returns the emails added.
 */
export function ensureDemoEmployees(
  data: Data,
  nowIso: string,
  hash: (pw: string) => string = hashPasswordSync,
): string[] {
  const users = ensureArray(data, "users");
  const added: string[] = [];
  for (const spec of DEMO_EMPLOYEES) {
    if (users.some((u: any) => sameEmail(u?.email, spec.email))) continue;
    users.push({
      id: nextIdIn(data, "users", "user"),
      name: spec.name,
      email: spec.email,
      passwordHash: hash(DEMO_PASSWORD),
      roles: [...spec.roles],
      departmentKey: spec.departmentKey,
      active: true,
      demo: true,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: nowIso,
    });
    added.push(spec.email);
  }
  return added;
}

/**
 * Adds each demo team whose name is not already in use (case-insensitive).
 * Members and supervisors are resolved by email; an email with no user is
 * skipped and reported. Existing teams are never modified.
 */
export function ensureDemoTeams(data: Data, nowIso: string): { added: string[]; missingEmails: string[] } {
  const teams = ensureArray(data, "teams");
  const users = ensureArray(data, "users");
  const added: string[] = [];
  const missingEmails: string[] = [];
  const idFor = (email: string): number | null => {
    const u = users.find((x: any) => sameEmail(x?.email, email));
    if (!u) {
      missingEmails.push(email);
      return null;
    }
    return u.id;
  };
  for (const spec of DEMO_TEAMS) {
    if (teams.some((t: any) => typeof t?.name === "string" && t.name.toLowerCase() === spec.name.toLowerCase())) {
      continue;
    }
    teams.push({
      id: nextIdIn(data, "teams", "team"),
      name: spec.name,
      departmentKey: spec.departmentKey,
      memberUserIds: spec.memberEmails.map(idFor).filter((x): x is number => x !== null),
      supervisorUserIds: spec.supervisorEmails.map(idFor).filter((x): x is number => x !== null),
      demo: true,
      createdAt: nowIso,
    });
    added.push(spec.name);
  }
  return { added, missingEmails };
}

// ── Steps ───────────────────────────────────────────────────────────────────

export interface UserMigrationEntry {
  id: number;
  email: string;
  name: string;
  legacyRole: string | null;
  roles: RoleKey[];
  departmentKey: string | null;
  passwordHashed: boolean;
  plaintextRemoved: boolean;
}

export interface StepReport {
  version: number;
  name: string;
  /** v1 only (empty for other steps). */
  users: UserMigrationEntry[];
  demoEmployeesAdded: string[];
  demoTeamsAdded: string[];
  missingTeamEmails: string[];
  warnings: string[];
  /** v2 only: how each display-name field was mapped to a user id. */
  ownership?: OwnershipReport;
}

// ── v2: stable user ids for ownership and authorship (RBAC Phase 4) ─────────

/**
 * Every field that identifies an employee by display name, with the id field
 * that becomes authoritative. The display name stays as it was (a
 * denormalized label; historical text is never rewritten).
 *
 * Deliberately NOT here: Account/Automation `createdByName` and
 * `lastModifiedByName` — audit stamps that no authorization reads, and
 * which can name non-employees (e.g. "Platform Integration User").
 */
export const OWNERSHIP_FIELDS = [
  { collection: "cases", nameField: "ownerName", idField: "ownerUserId" },
  { collection: "leads", nameField: "ownerName", idField: "ownerUserId" },
  { collection: "accounts", nameField: "ownerName", idField: "ownerUserId" },
  { collection: "contacts", nameField: "ownerName", idField: "ownerUserId" },
  { collection: "automations", nameField: "ownerName", idField: "ownerUserId" },
  { collection: "caseInteractions", nameField: "byName", idField: "byUserId" },
  { collection: "threadEntries", nameField: "authorName", idField: "authorUserId" },
  { collection: "messages", nameField: "senderName", idField: "senderUserId" },
  { collection: "mentions", nameField: "fromName", idField: "fromUserId" },
  { collection: "mentions", nameField: "toName", idField: "toUserId" },
  { collection: "conversations", nameField: "members", idField: "memberUserIds", list: true },
] as const;

export interface UnmappedName {
  collection: string;
  recordId: unknown;
  field: string;
  name: unknown;
  reason: "no_employee" | "ambiguous" | "empty";
}

export interface OwnershipReport {
  fields: { collection: string; field: string; idField: string; mapped: number; alreadySet: number }[];
  unmapped: UnmappedName[];
}

export class OwnershipMappingError extends Error {
  constructor(public readonly unmapped: UnmappedName[]) {
    super(
      `cannot map ${unmapped.length} display name(s) to exactly one employee: ` +
        unmapped
          .map((u) => `${u.collection}#${String(u.recordId)}.${u.field}=${JSON.stringify(u.name)} (${u.reason})`)
          .join("; "),
    );
    this.name = "OwnershipMappingError";
  }
}

/**
 * Adds the stable user-id fields from the display names, by EXACT name match
 * against the store's employees (active or not). Idempotent: a record whose
 * id field is already set is left alone. Strict: if any name maps to no
 * employee, or to more than one, NOTHING is changed and OwnershipMappingError
 * lists every such name — owners are never guessed.
 */
export function assignOwnershipIds(data: Data): OwnershipReport {
  const users = ensureArray(data, "users");
  const idsByName = new Map<string, number[]>();
  for (const u of users) {
    if (typeof u?.name !== "string" || typeof u?.id !== "number") continue;
    idsByName.set(u.name, [...(idsByName.get(u.name) ?? []), u.id]);
  }
  const resolve = (name: unknown): number | UnmappedName["reason"] => {
    if (typeof name !== "string" || name.trim() === "") return "empty";
    const ids = idsByName.get(name) ?? [];
    return ids.length === 1 ? ids[0] : ids.length === 0 ? "no_employee" : "ambiguous";
  };

  // Pass 1: resolve everything, change nothing.
  const unmapped: UnmappedName[] = [];
  const plan: { row: any; idField: string; value: number | number[]; entry: { mapped: number } }[] = [];
  const fields: OwnershipReport["fields"] = [];
  for (const spec of OWNERSHIP_FIELDS) {
    const entry = { collection: spec.collection, field: spec.nameField, idField: spec.idField, mapped: 0, alreadySet: 0 };
    fields.push(entry);
    for (const row of ensureArray(data, spec.collection)) {
      const isList = "list" in spec && spec.list;
      const already = isList ? Array.isArray(row[spec.idField]) : typeof row[spec.idField] === "number";
      if (already) {
        entry.alreadySet++;
        continue;
      }
      const miss = (name: unknown, reason: UnmappedName["reason"]) =>
        unmapped.push({ collection: spec.collection, recordId: row?.id, field: spec.nameField, name, reason });
      if (isList) {
        const names = Array.isArray(row[spec.nameField]) ? row[spec.nameField] : [];
        const ids: number[] = [];
        let ok = true;
        for (const n of names) {
          const res = resolve(n);
          if (typeof res === "number") ids.push(res);
          else {
            miss(n, res);
            ok = false;
          }
        }
        if (ok) plan.push({ row, idField: spec.idField, value: ids, entry });
      } else {
        const res = resolve(row[spec.nameField]);
        if (typeof res === "number") plan.push({ row, idField: spec.idField, value: res, entry });
        else miss(row[spec.nameField], res);
      }
    }
  }
  if (unmapped.length) throw new OwnershipMappingError(unmapped);

  // Pass 2: apply.
  for (const { row, idField, value, entry } of plan) {
    row[idField] = value;
    entry.mapped++;
  }
  return { fields, unmapped: [] };
}

interface Step {
  version: number;
  name: string;
  up(data: Data, ctx: { nowIso: string; hash: (pw: string) => string }): StepReport;
}

const STEPS: Step[] = [
  {
    version: 1,
    name: "identity-foundation",
    up(data, { nowIso, hash }) {
      const warnings: string[] = [];
      ensureArray(data, "teams");
      ensureArray(data, "sessions");
      const users = ensureArray(data, "users");

      const report: UserMigrationEntry[] = [];
      for (const u of users) {
        const legacyRole = typeof u.role === "string" ? u.role : null;

        // Roles: map the legacy single role once; keep roles[] if present.
        if (!Array.isArray(u.roles)) {
          const mapped = legacyRole ? LEGACY_ROLE_MAP[legacyRole] : undefined;
          if (!mapped) warnings.push(`user ${u.email}: legacy role "${legacyRole}" has no mapping; no roles assigned`);
          u.roles = mapped ? [...mapped] : [];
        } else {
          u.roles = u.roles.filter((r: unknown) => {
            if (isRoleKey(r)) return true;
            warnings.push(`user ${u.email}: unknown role "${String(r)}" dropped`);
            return false;
          });
        }
        if ("role" in u) delete u.role;

        if (!("departmentKey" in u)) {
          const first = u.roles[0] as RoleKey | undefined;
          u.departmentKey = first ? DEPARTMENT_FOR_ROLE[first] : null;
        }

        // Password: hash plaintext once, then drop the plaintext field.
        let passwordHashed = false;
        let plaintextRemoved = false;
        if (!isPasswordHash(u.passwordHash)) {
          if (typeof u.password === "string" && u.password.length > 0) {
            u.passwordHash = hash(u.password);
            passwordHashed = true;
          } else {
            u.passwordHash = "";
            u.mustChangePassword = true;
            warnings.push(`user ${u.email}: no password on file; cannot sign in until one is set`);
          }
        }
        if ("password" in u) {
          delete u.password;
          plaintextRemoved = true;
        }

        if (typeof u.active !== "boolean") u.active = true;
        if (typeof u.demo !== "boolean") u.demo = false;
        if (typeof u.mustChangePassword !== "boolean") u.mustChangePassword = false;
        if (!("lastLoginAt" in u)) u.lastLoginAt = null;

        report.push({
          id: u.id,
          email: u.email,
          name: u.name,
          legacyRole,
          roles: [...u.roles],
          departmentKey: u.departmentKey,
          passwordHashed,
          plaintextRemoved,
        });
      }

      const demoEmployeesAdded = ensureDemoEmployees(data, nowIso, hash);
      const teams = ensureDemoTeams(data, nowIso);
      for (const e of teams.missingEmails) warnings.push(`demo team member ${e} not found; skipped`);

      return {
        version: 1,
        name: "identity-foundation",
        users: report,
        demoEmployeesAdded,
        demoTeamsAdded: teams.added,
        missingTeamEmails: teams.missingEmails,
        warnings,
      };
    },
  },
  {
    version: 2,
    name: "ownership-user-ids",
    up(data) {
      const ownership = assignOwnershipIds(data);
      return {
        version: 2,
        name: "ownership-user-ids",
        users: [],
        demoEmployeesAdded: [],
        demoTeamsAdded: [],
        missingTeamEmails: [],
        warnings: [],
        ownership,
      };
    },
  },
];

export interface MigrateDataResult {
  fromVersion: number;
  toVersion: number;
  steps: StepReport[];
}

/**
 * Runs every pending step up to `targetVersion` (default: current) on `data`
 * in place. A no-op for a store already at that version.
 */
export function migrateData(
  data: Data,
  opts: { now?: Date; hash?: (pw: string) => string; targetVersion?: number } = {},
): MigrateDataResult {
  const fromVersion = schemaVersionOf(data);
  const nowIso = (opts.now ?? new Date()).toISOString();
  const hash = opts.hash ?? hashPasswordSync;
  const target = opts.targetVersion ?? CURRENT_SCHEMA_VERSION;
  const steps: StepReport[] = [];
  for (const step of [...STEPS].sort((a, b) => a.version - b.version)) {
    if (step.version <= schemaVersionOf(data) || step.version > target) continue;
    steps.push(step.up(data, { nowIso, hash }));
    data.meta = { ...(data.meta && typeof data.meta === "object" ? data.meta : {}), schemaVersion: step.version };
  }
  return { fromVersion, toVersion: schemaVersionOf(data), steps };
}

// ── File runner ─────────────────────────────────────────────────────────────

export interface MigrationReport {
  storeFile: string;
  fromVersion: number;
  toVersion: number;
  backupPath: string;
  sourceSha256: string;
  backupSha256: string;
  backupVerified: true;
  steps: StepReport[];
}

export type MigrateFileResult =
  | { status: "current"; data: Data }
  | { status: "migrated"; data: Data; report: MigrationReport };

export interface MigrateFileOptions {
  storeFile: string;
  backupDir: string;
  /** The bytes of storeFile as already read by the caller. */
  sourceBytes: Buffer;
  /** The parsed form of sourceBytes (will be migrated in place). */
  data: Data;
  now?: Date;
  hash?: (pw: string) => string;
  /** Test seam: how backup bytes are written to the open file descriptor. */
  writeBackup?: (fd: number, bytes: Buffer) => void;
  /** Migrate only up to this version (tests of earlier steps). Default: current. */
  targetVersion?: number;
}

function backupStamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export function backupFileName(fromVersion: number, now: Date, toVersion: number = CURRENT_SCHEMA_VERSION): string {
  return `store.pre-v${toVersion}.from-v${fromVersion}.${backupStamp(now)}.json`;
}

/**
 * Runs the pending steps on a deep copy and reports what they would do,
 * without touching `data` or any file. Throws MigrationAbortError if a step
 * would fail.
 */
export function dryRunMigration(
  data: Data,
  opts: { now?: Date; hash?: (pw: string) => string; targetVersion?: number } = {},
): MigrateDataResult {
  try {
    return migrateData(structuredClone(data), opts);
  } catch (err: any) {
    throw new MigrationAbortError(
      `dry run failed: ${err?.message ?? err}; nothing was backed up or written`,
    );
  }
}

export function migrateStoreFile(opts: MigrateFileOptions): MigrateFileResult {
  const { storeFile, backupDir, sourceBytes, data } = opts;
  const targetVersion = opts.targetVersion ?? CURRENT_SCHEMA_VERSION;
  if (!needsMigration(data, targetVersion)) return { status: "current", data };

  const now = opts.now ?? new Date();
  const fromVersion = schemaVersionOf(data);
  const sourceSha256 = sha256(sourceBytes);

  // 0. Dry run on a copy: if any step would fail, stop before backing up or
  //    writing anything.
  dryRunMigration(data, { now, hash: opts.hash, targetVersion });

  // 1. Backup, never overwriting an existing file.
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, backupFileName(fromVersion, now, targetVersion));
  let fd: number;
  try {
    fd = fs.openSync(backupPath, "wx");
  } catch (err: any) {
    throw new MigrationAbortError(
      `could not create backup ${backupPath} (${err?.code ?? err?.message}); store left unchanged`,
    );
  }
  try {
    (opts.writeBackup ?? ((d, b) => fs.writeSync(d, b, 0, b.length, 0)))(fd, sourceBytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // 2. Verify the backup and that the source did not change underneath us.
  const backupSha256 = sha256(fs.readFileSync(backupPath));
  if (backupSha256 !== sourceSha256) {
    throw new MigrationAbortError(
      `backup verification failed for ${backupPath}: sha256 ${backupSha256} != source ${sourceSha256}; store left unchanged`,
    );
  }
  const liveSha256 = sha256(fs.readFileSync(storeFile));
  if (liveSha256 !== sourceSha256) {
    throw new MigrationAbortError(
      `${storeFile} changed while it was being backed up; store left unchanged`,
    );
  }

  // 3. Migrate in memory. A throwing step aborts before anything is written.
  let result: MigrateDataResult;
  try {
    result = migrateData(data, { now, hash: opts.hash, targetVersion });
  } catch (err: any) {
    throw new MigrationAbortError(`migration step failed: ${err?.message ?? err}; store left unchanged`);
  }

  // 4. Atomic write: a complete temp file, then rename over the store.
  const tmp = `${storeFile}.migrating-${process.pid}`;
  const fdOut = fs.openSync(tmp, "wx");
  try {
    fs.writeSync(fdOut, JSON.stringify(data, null, 2));
    fs.fsyncSync(fdOut);
  } finally {
    fs.closeSync(fdOut);
  }
  fs.renameSync(tmp, storeFile);

  return {
    status: "migrated",
    data,
    report: {
      storeFile,
      fromVersion,
      toVersion: result.toVersion,
      backupPath,
      sourceSha256,
      backupSha256,
      backupVerified: true,
      steps: result.steps,
    },
  };
}
