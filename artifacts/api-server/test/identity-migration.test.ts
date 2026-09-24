import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { store, seed } from "../src/store";
import {
  CURRENT_SCHEMA_VERSION,
  MigrationAbortError,
  backupFileName,
  migrateData,
  migrateStoreFile,
  sha256,
} from "../src/migrations";
import { isPasswordHash, verifyPassword } from "../src/auth/password";
import { DEMO_EMPLOYEES, DEMO_TEAMS } from "../src/auth/identity";

/**
 * Phase 1 store migration (schema v0 → v1): users get hashed passwords,
 * roles[], departments and flags; demo employees and demo teams are added;
 * NOTHING else in the store changes. Driven directly on files inside this
 * test's throwaway working directory — never the repository's store.json.
 */

// A pre-Phase-1 store with the same business data as the seed, plus runtime
// data of the kind a real store accumulates.
let fresh: any;
function legacyStore(): any {
  const d = JSON.parse(JSON.stringify(fresh));
  const legacyRole: Record<string, string> = {
    "iris@example.com": "admin",
    "devon@example.com": "case_manager",
    "sara@example.com": "case_manager",
  };
  d.users = d.users
    .filter((u: any) => legacyRole[u.email])
    .map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      password: "test123",
      role: legacyRole[u.email],
      createdAt: u.createdAt,
    }));
  delete d.teams;
  delete d.sessions;
  delete d.meta;
  delete d.seq.team;
  delete d.seq.session;
  d.seq.user = 3;
  d.conversations.push({
    id: 1, name: null, type: "dm", createdAt: "2026-09-20T10:00:00.000Z", members: ["Iris Burgos", "Devon Park"],
  });
  d.messages.push({
    id: 1, conversationId: 1, senderName: "Iris Burgos", content: "runtime message",
    createdAt: "2026-09-20T10:01:00.000Z", deletedAt: null, caseTags: [3],
  });
  d.seq.conversation = 1;
  d.seq.message = 1;
  d.cases.push({ ...d.cases[0], id: 99, caseNumber: "CASE-099", title: "Created in the running app" });
  d.seq.case = 99;
  return d;
}

let dirCounter = 0;
function writeFixture(data: any): { dir: string; storeFile: string; backupDir: string; bytes: Buffer } {
  const dir = path.join(process.cwd(), "migration-fixtures", String(++dirCounter));
  fs.mkdirSync(dir, { recursive: true });
  const storeFile = path.join(dir, "store.json");
  fs.writeFileSync(storeFile, JSON.stringify(data, null, 2));
  return { dir, storeFile, backupDir: path.join(dir, "backups"), bytes: fs.readFileSync(storeFile) };
}

function runOnFile(storeFile: string, backupDir: string, extra: Partial<Parameters<typeof migrateStoreFile>[0]> = {}) {
  const sourceBytes = fs.readFileSync(storeFile);
  return migrateStoreFile({ storeFile, backupDir, sourceBytes, data: JSON.parse(sourceBytes.toString("utf-8")), ...extra });
}

const UNRELATED = [
  "accounts", "contacts", "accountContactLinks", "leads", "cases", "tasks", "documents",
  "conversations", "messages", "caseInteractions", "threadEntries", "mentions", "automations",
];

beforeAll(() => {
  seed(); // fresh seed in this file's temp directory
  fresh = JSON.parse(JSON.stringify(store));
});

describe("fresh seed", () => {
  it("builds the same identities the migration produces", () => {
    expect(fresh.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(fresh.users.map((u: any) => [u.email, u.roles, u.demo])).toEqual([
      ["iris@example.com", ["system_owner"], false],
      ["devon@example.com", ["csr"], false],
      ["sara@example.com", ["csr"], false],
      ...DEMO_EMPLOYEES.map((e) => [e.email, e.roles, true]),
    ]);
    expect(fresh.teams.map((t: any) => t.name)).toEqual(DEMO_TEAMS.map((t) => t.name));
    for (const u of fresh.users) {
      expect(isPasswordHash(u.passwordHash)).toBe(true);
      expect(u).not.toHaveProperty("password");
      expect(u).not.toHaveProperty("role");
    }
  });
});

describe("migrating a pre-Phase-1 store.json", () => {
  let fx: ReturnType<typeof writeFixture>;
  let legacy: any;
  let result: ReturnType<typeof migrateStoreFile>;
  let after: any;
  let afterText: string;

  beforeAll(() => {
    legacy = legacyStore();
    fx = writeFixture(legacy);
    result = runOnFile(fx.storeFile, fx.backupDir);
    afterText = fs.readFileSync(fx.storeFile, "utf-8");
    after = JSON.parse(afterText);
  });

  it("reports a v0 → v1 migration", () => {
    expect(result.status).toBe("migrated");
    if (result.status !== "migrated") return;
    expect(result.report.fromVersion).toBe(0);
    expect(result.report.toVersion).toBe(1);
    expect(after.meta).toEqual({ schemaVersion: 1 });
  });

  it("writes a byte-identical backup first, verified by SHA-256", () => {
    if (result.status !== "migrated") throw new Error("not migrated");
    const { backupPath, sourceSha256, backupSha256, backupVerified } = result.report;
    expect(path.dirname(backupPath)).toBe(fx.backupDir);
    expect(path.basename(backupPath)).toMatch(/^store\.pre-v1\.from-v0\.\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/);
    const backup = fs.readFileSync(backupPath);
    expect(backup.equals(fx.bytes)).toBe(true);
    expect(sourceSha256).toBe(sha256(fx.bytes));
    expect(backupSha256).toBe(sourceSha256);
    expect(backupVerified).toBe(true);
  });

  it("leaves every unrelated collection exactly as it was", () => {
    for (const key of UNRELATED) expect(after[key]).toEqual(legacy[key]);
    // Including the runtime data that is not in the seed.
    expect(after.cases.find((c: any) => c.id === 99).title).toBe("Created in the running app");
    expect(after.messages).toHaveLength(1);
  });

  it("keeps every existing seq counter and only adds identity ones", () => {
    for (const [k, v] of Object.entries(legacy.seq)) {
      if (k === "user") continue;
      expect(after.seq[k]).toBe(v);
    }
    expect(after.seq.user).toBe(9);
    expect(after.seq.team).toBe(3);
  });

  it("keeps existing employees' identities and maps their roles (D1)", () => {
    const byEmail = (e: string) => after.users.find((u: any) => u.email === e);
    for (const old of legacy.users) {
      expect(byEmail(old.email)).toMatchObject({ id: old.id, name: old.name, email: old.email, createdAt: old.createdAt });
    }
    expect(byEmail("iris@example.com")).toMatchObject({ roles: ["system_owner"], departmentKey: null, demo: false, active: true });
    expect(byEmail("devon@example.com")).toMatchObject({ roles: ["csr"], departmentKey: "customer_service", demo: false });
    expect(byEmail("sara@example.com")).toMatchObject({ roles: ["csr"], departmentKey: "customer_service", demo: false });
  });

  it("hashes every password and removes the plaintext from the file", async () => {
    expect(afterText).not.toMatch(/"password"\s*:/);
    expect(afterText).not.toContain("test123");
    for (const u of after.users) {
      expect(u).not.toHaveProperty("password");
      expect(u).not.toHaveProperty("role"); // the legacy single role is gone

      expect(isPasswordHash(u.passwordHash)).toBe(true);
      expect(await verifyPassword("test123", u.passwordHash)).toBe(true);
      expect(await verifyPassword("wrong", u.passwordHash)).toBe(false);
    }
  });

  it("adds each demo employee exactly once, flagged as demo", () => {
    for (const spec of DEMO_EMPLOYEES) {
      const matches = after.users.filter((u: any) => u.email === spec.email);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        name: spec.name, roles: spec.roles, departmentKey: spec.departmentKey,
        demo: true, active: true, mustChangePassword: false, lastLoginAt: null,
      });
    }
    expect(after.users).toHaveLength(9);
    expect(new Set(after.users.map((u: any) => u.id)).size).toBe(9);
  });

  it("creates the three demo teams exactly once with the right people", () => {
    const id = (e: string) => after.users.find((u: any) => u.email === e).id;
    expect(after.teams).toHaveLength(3);
    expect(after.teams.map((t: any) => ({ name: t.name, members: t.memberUserIds, supervisors: t.supervisorUserIds }))).toEqual([
      { name: "Customer Service", members: [id("devon@example.com"), id("sara@example.com")], supervisors: [id("nadia@example.com")] },
      { name: "Business Advisors", members: [id("leo@example.com")], supervisors: [id("grace@example.com")] },
      { name: "Operations", members: [id("omar@example.com")], supervisors: [id("rachel@example.com")] },
    ]);
    expect(after.teams.every((t: any) => t.demo === true)).toBe(true);
    expect(after.sessions).toEqual([]);
  });

  it("is idempotent: a second run changes nothing and makes no second backup", () => {
    const bytesBefore = fs.readFileSync(fx.storeFile);
    const backupsBefore = fs.readdirSync(fx.backupDir);

    const again = runOnFile(fx.storeFile, fx.backupDir);

    expect(again.status).toBe("current");
    expect(fs.readFileSync(fx.storeFile).equals(bytesBefore)).toBe(true);
    expect(fs.readdirSync(fx.backupDir)).toEqual(backupsBefore);
  });
});

describe("step-level idempotency", () => {
  it("re-running the step on migrated data (version marker lost) adds nothing and re-hashes nothing", () => {
    const data = legacyStore();
    migrateData(data);
    const snapshot = JSON.parse(JSON.stringify(data));
    delete data.meta; // simulate a lost version marker

    migrateData(data);

    expect(data.users).toEqual(snapshot.users);
    expect(data.teams).toEqual(snapshot.teams);
    expect(data.meta).toEqual({ schemaVersion: 1 });
  });

  it("does not duplicate or modify an employee who already uses a demo email", () => {
    const data = legacyStore();
    data.users.push({
      id: 50, name: "Real Nadia", email: "NADIA@example.com", password: "own-secret", role: "case_manager",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    migrateData(data);

    const nadias = data.users.filter((u: any) => u.email.toLowerCase() === "nadia@example.com");
    expect(nadias).toHaveLength(1);
    expect(nadias[0]).toMatchObject({ id: 50, name: "Real Nadia", roles: ["csr"], demo: false });
    // …and the Customer Service team uses that existing account as supervisor.
    expect(data.teams.find((t: any) => t.name === "Customer Service").supervisorUserIds).toEqual([50]);
  });

  it("never runs on a store that is already current", () => {
    const data = JSON.parse(JSON.stringify(fresh));
    const res = migrateData(data);
    expect(res.steps).toEqual([]);
    expect(data).toEqual(fresh);
  });
});

describe("the migration refuses to proceed unsafely", () => {
  it("never overwrites an existing backup (exclusive creation)", () => {
    const fx = writeFixture(legacyStore());
    const now = new Date("2026-09-24T12:00:00.000Z");
    fs.mkdirSync(fx.backupDir, { recursive: true });
    const existing = path.join(fx.backupDir, backupFileName(0, now));
    fs.writeFileSync(existing, "an older backup");

    expect(() => runOnFile(fx.storeFile, fx.backupDir, { now })).toThrow(MigrationAbortError);
    expect(fs.readFileSync(existing, "utf-8")).toBe("an older backup");
    expect(fs.readFileSync(fx.storeFile).equals(fx.bytes)).toBe(true);
  });

  it("stops without writing when the backup does not verify", () => {
    const fx = writeFixture(legacyStore());
    const corrupting = (fd: number, bytes: Buffer) => {
      const bad = Buffer.from(bytes);
      bad[10] = bad[10] ^ 0xff;
      fs.writeSync(fd, bad);
    };

    expect(() => runOnFile(fx.storeFile, fx.backupDir, { writeBackup: corrupting })).toThrow(/backup verification failed/);
    expect(fs.readFileSync(fx.storeFile).equals(fx.bytes)).toBe(true);
    expect(fs.readdirSync(fx.dir).filter((f) => f.includes(".migrating-"))).toEqual([]);
  });

  it("stops without writing when store.json changes during the backup", () => {
    const fx = writeFixture(legacyStore());
    const racing = (fd: number, bytes: Buffer) => {
      fs.writeSync(fd, bytes);
      fs.appendFileSync(fx.storeFile, " "); // someone else wrote meanwhile
    };
    const changed = () => fs.readFileSync(fx.storeFile);

    expect(() => runOnFile(fx.storeFile, fx.backupDir, { writeBackup: racing })).toThrow(/changed while it was being backed up/);
    expect(changed().subarray(0, fx.bytes.length).equals(fx.bytes)).toBe(true);
    expect(JSON.parse(changed().toString()).meta).toBeUndefined();
  });
});
