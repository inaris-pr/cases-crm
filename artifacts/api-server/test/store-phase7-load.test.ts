import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { hashPasswordSync } from "../src/auth/password";

/**
 * Phase 7 adds optional Case fields and two collections WITHOUT a schema
 * version or migration: a current (v2) store written before Phase 7 loads
 * as-is — nothing is written, no backup is made, old Cases read as
 * uncategorized with an unknown closing time — and works on the next save.
 * Must write the file before anything imports the store (routes.ts seeds at
 * module load).
 */
const T0 = "2026-01-01T00:00:00.000Z";
const V2 = {
  meta: { schemaVersion: 2 },
  accounts: [{ id: 1, name: "Kept Holdings LLC", portalId: 1, ownerName: "Iris Burgos", ownerUserId: 1, archived: false, createdAt: T0 }],
  contacts: [], accountContactLinks: [], leads: [],
  cases: [
    { id: 1, caseNumber: "CASE-001", title: "Open one", accountId: 1, primaryContactId: null, status: "in_progress", priority: "medium",
      description: null, tags: [], ownerName: "Iris Burgos", ownerUserId: 1, createdAt: T0, updatedAt: T0 },
    { id: 2, caseNumber: "CASE-002", title: "Closed long ago", accountId: 1, primaryContactId: null, status: "completed", priority: "low",
      description: null, tags: [], ownerName: "Iris Burgos", ownerUserId: 1, createdAt: T0, updatedAt: "2026-02-01T00:00:00.000Z" },
  ],
  tasks: [], documents: [], conversations: [], messages: [], caseInteractions: [], threadEntries: [], mentions: [], automations: [],
  users: [
    { id: 1, name: "Iris Burgos", email: "iris@example.com", passwordHash: hashPasswordSync("test123"), roles: ["system_owner"],
      departmentKey: null, active: true, demo: true, mustChangePassword: false, lastLoginAt: null, createdAt: T0 },
  ],
  teams: [], sessions: [],
  seq: { account: 1, contact: 0, accountContactLink: 0, lead: 0, case: 2, caseNumber: 2, task: 0, document: 0,
    conversation: 0, message: 0, caseInteraction: 0, threadEntry: 0, mention: 0, user: 1, team: 0, session: 0, automation: 0 },
};

const dataDir = path.join(process.cwd(), "data");
const storeFile = path.join(dataDir, "store.json");
let original: Buffer;

beforeAll(() => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(V2, null, 2));
  original = fs.readFileSync(storeFile);
});

describe("loading a pre-Phase-7 store", () => {
  it("does not migrate, back up, rewrite or reseed", async () => {
    const { store } = await import("../src/store");
    await import("../src/routes"); // loads the file (seed() → loadFromDisk)
    expect(store.meta.schemaVersion).toBe(2);
    expect(store.cases.map((c) => c.title)).toEqual(["Open one", "Closed long ago"]);
    expect(fs.existsSync(path.join(dataDir, "backups"))).toBe(false);
    expect(fs.readFileSync(storeFile).equals(original)).toBe(true);

    // In memory: uncategorized, closing time unknown — never taken from updatedAt.
    for (const c of store.cases) {
      expect({ category: c.category, closedAt: c.closedAt, closedByUserId: c.closedByUserId, closedByName: c.closedByName })
        .toEqual({ category: null, closedAt: null, closedByUserId: null, closedByName: null });
    }
    expect(store.caseStatusEvents).toEqual([]);
    expect(store.caseEscalations).toEqual([]);

    // The API reads the old Case as uncategorized with no closing time.
    const { createTestApp, loginAs } = await import("./helpers/app");
    const { apiAs } = await import("./helpers/api");
    const iris = apiAs(createTestApp(), loginAs("iris@example.com"));
    const legacy = await iris.get("/cases/2");
    expect(legacy.status).toBe(200);
    expect(legacy.body).toMatchObject({ category: null, closedAt: null, resolution: null, statusHistory: [], escalations: [] });

    // The first ordinary write works and records history with fresh ids.
    const res = await iris.patch("/cases/1", { status: "completed" });
    expect(res.status).toBe(200);
    expect(store.caseStatusEvents.map((e) => e.id)).toEqual([1]);
    await new Promise((r) => setTimeout(r, 250)); // debounced persist
    const saved = JSON.parse(fs.readFileSync(storeFile, "utf-8"));
    expect(saved.meta).toEqual({ schemaVersion: 2 });
    expect(saved.caseStatusEvents).toHaveLength(1);
    // The next ordinary save writes the new fields as null — the legacy
    // closed Case still has no closing time (not its updatedAt).
    expect(saved.cases[1]).toMatchObject({ status: "completed", closedAt: null, category: null, updatedAt: "2026-02-01T00:00:00.000Z" });
    expect(saved.cases[0]).toMatchObject({ status: "completed", closedByUserId: 1 });
    expect(fs.existsSync(path.join(dataDir, "backups"))).toBe(false);
  });
});
