import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { store, seed } from "../src/store";
import {
  CURRENT_SCHEMA_VERSION,
  MigrationAbortError,
  OWNERSHIP_FIELDS,
  OwnershipMappingError,
  assignOwnershipIds,
  dryRunMigration,
  migrateData,
  migrateStoreFile,
  sha256,
} from "../src/migrations";

/**
 * RBAC Phase 4 store migration (schema v1 → v2): every display-name owner /
 * author / sender / member gets its stable employee id, by exact name. Names
 * stay exactly as they were. If any name maps to no employee, or to more than
 * one, NOTHING is backed up or written and the migration refuses with the
 * list — owners are never guessed. Runs only on throwaway files.
 */
const ID_FIELDS = new Set(OWNERSHIP_FIELDS.map((f) => f.idField as string));

/** A deep copy without any of the v2 id fields. */
function withoutIds(value: any): any {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !ID_FIELDS.has(k)).map(([k, v]) => [k, withoutIds(v)]));
  }
  return value;
}

let fresh: any;

/** A v1 store: today's seed without the id fields, plus runtime activity. */
function v1Store(): any {
  const d = withoutIds(JSON.parse(JSON.stringify(fresh)));
  d.meta = { schemaVersion: 1 };
  d.conversations.push({ id: 1, name: "Ops", type: "group", createdAt: "2026-09-20T10:00:00.000Z", members: ["Iris Burgos", "Devon Park", "Omar Haddad"] });
  d.messages.push({ id: 1, conversationId: 1, senderName: "Devon Park", content: "hello", createdAt: "2026-09-20T10:01:00.000Z", deletedAt: null, caseTags: [] });
  d.mentions.push({ id: 1, threadEntryId: 1, caseId: 1, fromName: "Iris Burgos", toName: "Sara Mitchell", body: "@Sara ping", readAt: null, createdAt: "2026-09-20T10:02:00.000Z" });
  d.seq.conversation = 1;
  d.seq.message = 1;
  d.seq.mention = 1;
  // A record owned by an employee who has since been deactivated.
  const omar = d.users.find((u: any) => u.name === "Omar Haddad");
  omar.active = false;
  d.cases.push({ ...d.cases[0], id: 99, caseNumber: "CASE-099", ownerName: "Omar Haddad" });
  d.seq.case = 99;
  return d;
}

let n = 0;
function writeFixture(data: any) {
  const dir = path.join(process.cwd(), "ownership-fixtures", String(++n));
  fs.mkdirSync(dir, { recursive: true });
  const storeFile = path.join(dir, "store.json");
  fs.writeFileSync(storeFile, JSON.stringify(data, null, 2));
  return { dir, storeFile, backupDir: path.join(dir, "backups"), bytes: fs.readFileSync(storeFile) };
}
function run(storeFile: string, backupDir: string) {
  const bytes = fs.readFileSync(storeFile);
  return migrateStoreFile({ storeFile, backupDir, sourceBytes: bytes, data: JSON.parse(bytes.toString("utf-8")) });
}
const idOf = (d: any, name: string) => d.users.find((u: any) => u.name === name).id;

beforeAll(() => {
  seed();
  fresh = JSON.parse(JSON.stringify(store));
});

describe("fresh seed", () => {
  it("is at the current version with an id on every owner, author, sender and member", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
    expect(fresh.meta.schemaVersion).toBe(2);
    for (const spec of OWNERSHIP_FIELDS) {
      for (const row of fresh[spec.collection]) {
        if ("list" in spec) expect(Array.isArray(row[spec.idField])).toBe(true);
        else expect(row[spec.idField]).toBe(idOf(fresh, row[spec.nameField]));
      }
    }
    expect(fresh.cases.every((c: any) => typeof c.ownerUserId === "number")).toBe(true);
  });
});

describe("migrating a v1 store", () => {
  let fx: ReturnType<typeof writeFixture>;
  let before: any;
  let result: ReturnType<typeof migrateStoreFile>;
  let after: any;

  beforeAll(() => {
    before = v1Store();
    fx = writeFixture(before);
    result = run(fx.storeFile, fx.backupDir);
    after = JSON.parse(fs.readFileSync(fx.storeFile, "utf-8"));
  });

  it("reports v1 → v2 with per-field counts", () => {
    if (result.status !== "migrated") throw new Error("not migrated");
    expect(result.report.fromVersion).toBe(1);
    expect(result.report.toVersion).toBe(2);
    const ownership = result.report.steps[0].ownership!;
    expect(ownership.unmapped).toEqual([]);
    const count = (c: string, f: string) => ownership.fields.find((x) => x.collection === c && x.idField === f)!.mapped;
    expect(count("cases", "ownerUserId")).toBe(before.cases.length);
    expect(count("accounts", "ownerUserId")).toBe(before.accounts.length);
    expect(count("threadEntries", "authorUserId")).toBe(before.threadEntries.length);
    expect(count("conversations", "memberUserIds")).toBe(1);
    expect(count("mentions", "toUserId")).toBe(1);
  });

  it("writes a byte-identical, SHA-256 verified backup first", () => {
    if (result.status !== "migrated") throw new Error("not migrated");
    const { backupPath, sourceSha256, backupSha256 } = result.report;
    expect(path.basename(backupPath)).toMatch(/^store\.pre-v2\.from-v1\.\d{4}-\d{2}-\d{2}T[\d-]+Z\.json$/);
    expect(fs.readFileSync(backupPath).equals(fx.bytes)).toBe(true);
    expect(sourceSha256).toBe(sha256(fx.bytes));
    expect(backupSha256).toBe(sourceSha256);
  });

  it("maps every name to the right employee id — including an inactive owner", () => {
    for (const c of after.cases) expect(c.ownerUserId).toBe(idOf(after, c.ownerName));
    expect(after.cases.find((c: any) => c.id === 99).ownerUserId).toBe(idOf(after, "Omar Haddad"));
    for (const l of after.leads) expect(l.ownerUserId).toBe(idOf(after, l.ownerName));
    for (const a of after.accounts) expect(a.ownerUserId).toBe(idOf(after, a.ownerName));
    for (const c of after.contacts) expect(c.ownerUserId).toBe(idOf(after, c.ownerName));
    for (const a of after.automations) expect(a.ownerUserId).toBe(idOf(after, a.ownerName));
    for (const i of after.caseInteractions) expect(i.byUserId).toBe(idOf(after, i.byName));
    for (const t of after.threadEntries) expect(t.authorUserId).toBe(idOf(after, t.authorName));
    expect(after.messages[0].senderUserId).toBe(idOf(after, "Devon Park"));
    expect(after.mentions[0]).toMatchObject({ fromUserId: idOf(after, "Iris Burgos"), toUserId: idOf(after, "Sara Mitchell") });
    expect(after.conversations[0].memberUserIds).toEqual(["Iris Burgos", "Devon Park", "Omar Haddad"].map((x) => idOf(after, x)));
  });

  it("changes nothing else: names, business data, users, teams, sequences", () => {
    expect(withoutIds(after)).toEqual({ ...before, meta: { schemaVersion: 2 } });
  });

  it("does not need audit stamps naming non-employees (they stay names)", () => {
    expect(before.accounts.some((a: any) => a.createdByName === "Platform Integration User")).toBe(true);
    expect(after.accounts.every((a: any) => !("createdByUserId" in a))).toBe(true);
  });

  it("is idempotent: a second run does nothing and makes no second backup", () => {
    const bytes = fs.readFileSync(fx.storeFile);
    const backups = fs.readdirSync(fx.backupDir);
    expect(run(fx.storeFile, fx.backupDir).status).toBe("current");
    expect(fs.readFileSync(fx.storeFile).equals(bytes)).toBe(true);
    expect(fs.readdirSync(fx.backupDir)).toEqual(backups);
  });
});

describe("step idempotency", () => {
  it("re-running the step keeps ids already set, even ones that differ from the name", () => {
    const data = v1Store();
    data.cases[0].ownerUserId = idOf(data, "Sara Mitchell"); // set by someone earlier
    migrateData(data);
    const snapshot = JSON.parse(JSON.stringify(data));
    expect(data.cases[0].ownerUserId).toBe(idOf(data, "Sara Mitchell"));
    delete data.meta;
    migrateData(data);
    expect(data).toEqual({ ...snapshot, meta: { schemaVersion: 2 } });
  });
});

describe("names that cannot be mapped stop the migration", () => {
  function expectRefused(data: any, pattern: RegExp) {
    const fx = writeFixture(data);
    expect(() => run(fx.storeFile, fx.backupDir)).toThrow(MigrationAbortError);
    expect(() => run(fx.storeFile, fx.backupDir)).toThrow(pattern);
    // Nothing written: no backup, no temp file, store byte-identical.
    expect(fs.existsSync(fx.backupDir) ? fs.readdirSync(fx.backupDir) : []).toEqual([]);
    expect(fs.readdirSync(fx.dir)).toEqual(["store.json"]);
    expect(fs.readFileSync(fx.storeFile).equals(fx.bytes)).toBe(true);
  }

  it("an owner name that matches no employee", () => {
    const d = v1Store();
    d.leads[0].ownerName = "Former Contractor";
    expectRefused(d, /leads#\d+\.ownerName="Former Contractor" \(no_employee\)/);
  });

  it("a name shared by two employees (ambiguous)", () => {
    const d = v1Store();
    d.users.push({ ...d.users.find((u: any) => u.name === "Devon Park"), id: 77, email: "devon2@example.com" });
    expectRefused(d, /Devon Park" \(ambiguous\)/);
  });

  it("an empty author name, and a conversation member nobody is", () => {
    const d = v1Store();
    d.threadEntries[0].authorName = "";
    d.conversations[0].members.push("Ghost");
    expectRefused(d, /threadEntries#\d+\.authorName="" \(empty\).*conversations#1\.members="Ghost" \(no_employee\)/);
  });

  it("lists every problem at once and changes nothing in memory", () => {
    const d = v1Store();
    d.cases[0].ownerName = "Nobody";
    d.messages[0].senderName = "Also Nobody";
    const copy = JSON.parse(JSON.stringify(d));
    let err: unknown;
    try {
      assignOwnershipIds(d);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OwnershipMappingError);
    expect((err as OwnershipMappingError).unmapped.map((u) => u.name)).toEqual(["Nobody", "Also Nobody"]);
    expect(d).toEqual(copy);
  });
});

describe("dry run", () => {
  it("reports what would happen without changing the data", () => {
    const d = v1Store();
    const copy = JSON.parse(JSON.stringify(d));
    const res = dryRunMigration(d);
    expect(res.toVersion).toBe(2);
    expect(res.steps[0].ownership!.fields.find((f) => f.collection === "cases")!.mapped).toBe(d.cases.length);
    expect(d).toEqual(copy);
  });

  it("turns a failing step into MigrationAbortError", () => {
    const d = v1Store();
    d.cases[0].ownerName = "Nobody";
    expect(() => dryRunMigration(d)).toThrow(/dry run failed/);
  });
});
