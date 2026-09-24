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

export const CURRENT_SCHEMA_VERSION = 1;

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

export function needsMigration(data: Data): boolean {
  return schemaVersionOf(data) < CURRENT_SCHEMA_VERSION;
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
  users: UserMigrationEntry[];
  demoEmployeesAdded: string[];
  demoTeamsAdded: string[];
  missingTeamEmails: string[];
  warnings: string[];
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
];

export interface MigrateDataResult {
  fromVersion: number;
  toVersion: number;
  steps: StepReport[];
}

/** Runs every pending step on `data` in place. A no-op for a current store. */
export function migrateData(
  data: Data,
  opts: { now?: Date; hash?: (pw: string) => string } = {},
): MigrateDataResult {
  const fromVersion = schemaVersionOf(data);
  const nowIso = (opts.now ?? new Date()).toISOString();
  const hash = opts.hash ?? hashPasswordSync;
  const steps: StepReport[] = [];
  for (const step of STEPS) {
    if (step.version <= schemaVersionOf(data)) continue;
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
}

function backupStamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export function backupFileName(fromVersion: number, now: Date): string {
  return `store.pre-v${CURRENT_SCHEMA_VERSION}.from-v${fromVersion}.${backupStamp(now)}.json`;
}

export function migrateStoreFile(opts: MigrateFileOptions): MigrateFileResult {
  const { storeFile, backupDir, sourceBytes, data } = opts;
  if (!needsMigration(data)) return { status: "current", data };

  const now = opts.now ?? new Date();
  const fromVersion = schemaVersionOf(data);
  const sourceSha256 = sha256(sourceBytes);

  // 1. Backup, never overwriting an existing file.
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, backupFileName(fromVersion, now));
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
    result = migrateData(data, { now, hash: opts.hash });
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
