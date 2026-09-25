import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { hashPasswordSync } from "../src/auth/password";

/**
 * Phase 8 adds the Knowledge Base WITHOUT touching the persisted store: no
 * collection, no seq counter, no schema version, no migration. A current (v2)
 * store written before Phase 8 loads byte-for-byte unchanged, and the
 * articles are served next to it. Writes the file before anything imports
 * the store (routes.ts seeds at module load).
 */
const T0 = "2026-01-01T00:00:00.000Z";
const V2_PRE_PHASE_8 = {
  meta: { schemaVersion: 2 },
  accounts: [{ id: 1, name: "Kept Holdings LLC", portalId: 1, ownerName: "Iris Burgos", ownerUserId: 1, archived: false, createdAt: T0 }],
  contacts: [], accountContactLinks: [], leads: [],
  cases: [
    { id: 1, caseNumber: "CASE-001", title: "Existing case", accountId: 1, primaryContactId: null, status: "in_progress", priority: "medium",
      description: null, tags: [], ownerName: "Iris Burgos", ownerUserId: 1, createdAt: T0, updatedAt: T0,
      category: "compliance", closedAt: null, closedByUserId: null, closedByName: null },
  ],
  tasks: [], documents: [], conversations: [], messages: [], caseInteractions: [], threadEntries: [], mentions: [], automations: [],
  caseStatusEvents: [], caseEscalations: [], caseActivities: [],
  users: [
    { id: 1, name: "Iris Burgos", email: "iris@example.com", passwordHash: hashPasswordSync("test123"), roles: ["system_owner"],
      departmentKey: null, active: true, demo: true, mustChangePassword: false, lastLoginAt: null, createdAt: T0 },
  ],
  teams: [], sessions: [],
  seq: { account: 1, contact: 0, accountContactLink: 0, lead: 0, case: 1, caseNumber: 1, task: 0, document: 0,
    conversation: 0, message: 0, caseInteraction: 0, threadEntry: 0, mention: 0, user: 1, team: 0, session: 0, automation: 0,
    caseStatusEvent: 0, caseEscalation: 0, caseActivity: 0 },
};

const dataDir = path.join(process.cwd(), "data");
const storeFile = path.join(dataDir, "store.json");
let original: Buffer;

beforeAll(() => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(V2_PRE_PHASE_8, null, 2));
  original = fs.readFileSync(storeFile);
});

describe("loading a pre-Phase-8 store", () => {
  it("loads unchanged — no migration, backup or rewrite — and the Knowledge Base is served beside it", async () => {
    const { store } = await import("../src/store");
    await import("../src/routes");
    expect(store.meta.schemaVersion).toBe(2);
    expect(store.cases.map((c) => c.title)).toEqual(["Existing case"]);
    expect(Object.keys(store).some((k) => /knowledge/i.test(k))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, "backups"))).toBe(false);
    expect(fs.readFileSync(storeFile).equals(original)).toBe(true);

    const { createTestApp, loginAs } = await import("./helpers/app");
    const { apiAs } = await import("./helpers/api");
    const iris = apiAs(createTestApp(), loginAs("iris@example.com"));
    const list = await iris.get("/knowledge/articles");
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(5);
    expect((await iris.get("/knowledge/articles/llc-de-state-services")).body.sections.length).toBe(10);

    // Signing in saves the new session as it always has; still no knowledge data in the file.
    await new Promise((r) => setTimeout(r, 250));
    const saved = JSON.parse(fs.readFileSync(storeFile, "utf-8"));
    expect(Object.keys(saved).some((k) => /knowledge/i.test(k))).toBe(false);
    expect(saved.meta).toEqual({ schemaVersion: 2 });
    expect(fs.existsSync(path.join(dataDir, "backups"))).toBe(false);
  });
});
