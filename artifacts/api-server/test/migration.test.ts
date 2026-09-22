import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Regression for the store.json migration hazard.
 *
 * loadFromDisk() does Object.assign(store, parsed), which replaces whole
 * objects including `seq`. A store.json written before automations existed has
 * no `automations` array and no `seq.automation`, so without normalizeLoaded()
 * nextId() would compute `undefined + 1 = NaN` and every automation would be
 * created with id NaN.
 *
 * This file must NOT import the app helper: that pulls in routes.ts, which
 * calls seed() at module load. Here the legacy file has to be on disk first.
 */

/** A store in the shape written before this feature, with three defects. */
const LEGACY_STORE = {
  accounts: [
    {
      id: 7,
      name: "Legacy Holdings LLC",
      portalId: 991234, // present, so loadFromDisk's pre-portal-fields guard passes
      ownerName: "Iris Burgos",
      archived: false,
      createdAt: "2026-01-04T10:00:00.000Z",
    },
  ],
  contacts: [{ id: 4, firstName: "Legacy", lastName: "Person", email: null, phone: null, title: null, ownerName: "Iris Burgos", createdAt: "2026-01-04T10:00:00.000Z" }],
  accountContactLinks: [],
  leads: [],
  cases: [
    {
      id: 3,
      caseNumber: "CASE-003",
      title: "Legacy case",
      accountId: 7,
      primaryContactId: null,
      status: "intake",
      priority: "medium",
      description: null,
      tags: [],
      ownerName: "Iris Burgos",
      createdAt: "2026-01-04T10:00:00.000Z",
      updatedAt: "2026-01-04T10:00:00.000Z",
    },
  ],
  tasks: [],
  documents: [],
  conversations: [],
  messages: [],
  caseInteractions: [],
  threadEntries: [],
  mentions: [],
  users: [{ id: 1, name: "Iris Burgos", email: "iris@example.com", password: "test123", role: "admin", createdAt: "2026-01-04T10:00:00.000Z" }],
  seq: {
    // defect 1: no `automation` key at all
    account: 7,
    contact: 4,
    accountContactLink: 0,
    lead: 0,
    // defect 2: lower than the id actually present (a case with id 3 exists)
    case: 1,
    // defect 3: `caseNumber` missing entirely
    task: 0,
    document: 0,
    conversation: 0,
    message: 0,
    caseInteraction: 0,
    threadEntry: 0,
    mention: 0,
    user: 1,
  },
  // defect 0: no `automations` collection at all
};

let store: typeof import("../src/store");

beforeAll(async () => {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "store.json"), JSON.stringify(LEGACY_STORE, null, 2), "utf-8");

  store = await import("../src/store");
  store.seed(); // hydrates from the legacy file rather than re-seeding
});

describe("loading a store.json that predates automations", () => {
  it("hydrates from the file instead of running the demo seed", () => {
    expect(store.store.accounts).toHaveLength(1);
    expect(store.store.accounts[0].name).toBe("Legacy Holdings LLC");
    expect(store.store.cases).toHaveLength(1);
    // The seed would have produced 17 accounts and a seeded global automation.
    expect(store.store.automations.some((a) => a.name === "High-priority intake routing")).toBe(false);
  });

  it("preserves every existing record untouched", () => {
    expect(store.store.accounts[0].id).toBe(7);
    expect(store.store.accounts[0].portalId).toBe(991234);
    expect(store.store.contacts[0].firstName).toBe("Legacy");
    expect(store.store.cases[0].caseNumber).toBe("CASE-003");
    expect(store.store.users[0].email).toBe("iris@example.com");
  });

  it("back-fills the missing automations collection", () => {
    expect(Array.isArray(store.store.automations)).toBe(true);
    expect(store.store.automations).toHaveLength(0);
  });

  it("back-fills the missing seq.automation counter as a number", () => {
    expect(typeof store.store.seq.automation).toBe("number");
    expect(Number.isFinite(store.store.seq.automation)).toBe(true);
    expect(store.store.seq.automation).toBe(0);
  });

  it("issues a valid integer id for the first automation — not NaN", () => {
    const id = store.nextAutomationId();

    expect(Number.isNaN(id)).toBe(false);
    expect(Number.isInteger(id)).toBe(true);
    expect(id).toBe(1);
  });

  it("repairs a seq counter that sits below an id already in use", () => {
    // The file claimed seq.case = 1 while a case with id 3 exists; issuing
    // from 1 would have collided.
    expect(store.store.seq.case).toBeGreaterThanOrEqual(3);
    expect(store.nextCaseId()).toBeGreaterThan(3);
  });

  it("recovers the missing caseNumber counter from existing case numbers", () => {
    expect(store.store.seq.caseNumber).toBe(3);
    expect(store.nextCaseNumber()).toBe("CASE-004");
  });
});
