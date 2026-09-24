import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * End to end: the API process starting on a pre-Phase-1 store.json migrates
 * it in place (backup + verification) instead of reseeding, and the migrated
 * employees can sign in. Must not import the app helper before the legacy
 * file is on disk (routes.ts seeds at module load).
 */
const LEGACY = {
  accounts: [{ id: 1, name: "Kept Holdings LLC", portalId: 1, ownerName: "Iris Burgos", archived: false, createdAt: "2026-01-01T00:00:00.000Z" }],
  contacts: [], accountContactLinks: [], leads: [], cases: [], tasks: [], documents: [],
  conversations: [], messages: [], caseInteractions: [], threadEntries: [], mentions: [], automations: [],
  users: [
    { id: 1, name: "Iris Burgos", email: "iris@example.com", password: "test123", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: 2, name: "Devon Park", email: "devon@example.com", password: "test123", role: "case_manager", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
  seq: { account: 1, contact: 0, accountContactLink: 0, lead: 0, case: 0, caseNumber: 0, task: 0, document: 0,
    conversation: 0, message: 0, caseInteraction: 0, threadEntry: 0, mention: 0, user: 2, automation: 0 },
};

const dataDir = path.join(process.cwd(), "data");
const storeFile = path.join(dataDir, "store.json");
let original: Buffer;

beforeAll(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(LEGACY, null, 2));
  original = fs.readFileSync(storeFile);
});

describe("API startup on a pre-Phase-1 store", () => {
  it("migrates in place, keeps the data, and leaves a verified backup", async () => {
    const { store } = await import("../src/store");
    const { createTestApp } = await import("./helpers/app"); // seeds → migrates

    // Not reseeded: the same account, now also carrying its owner's stable
    // user id (v2 ownership step).
    expect(store.accounts).toEqual([{ ...LEGACY.accounts[0], ownerUserId: 1 }]);
    expect(store.meta.schemaVersion).toBe(2);
    expect(store.users.map((u) => u.email)).toEqual([
      "iris@example.com", "devon@example.com",
      "nadia@example.com", "leo@example.com", "grace@example.com", "omar@example.com", "rachel@example.com", "tessa@example.com",
    ]);
    expect(store.teams.map((t) => t.name)).toEqual(["Customer Service", "Business Advisors", "Operations"]);
    // Sara is not in this store, so the Customer Service team has only Devon.
    expect(store.teams[0].memberUserIds).toEqual([2]);

    const backups = fs.readdirSync(path.join(dataDir, "backups"));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dataDir, "backups", backups[0])).equals(original)).toBe(true);

    const onDisk = fs.readFileSync(storeFile, "utf-8");
    expect(onDisk).not.toContain("test123");
    expect(JSON.parse(onDisk).meta).toEqual({ schemaVersion: 2 });

    // …and a migrated employee signs in with the same password as before.
    const request = (await import("supertest")).default;
    await request(createTestApp())
      .post("/api/auth/login")
      .send({ email: "devon@example.com", password: "test123" })
      .expect(200);
  });
});
