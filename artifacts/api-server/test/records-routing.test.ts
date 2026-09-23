import { describe, it, expect } from "vitest";
import {
  DEFAULT_RECORDS_TAB,
  LEGACY_LIST_ROUTES,
  RECORDS_BASE,
  RECORDS_TABS,
  RECORDS_TAB_LABELS,
  isRecordsLocation,
  isRecordsTab,
  recordsPath,
} from "../../cases/src/lib/records";

/**
 * The Records workspace's URL contract.
 *
 * This is frontend code, tested here because the API server's Vitest suite is
 * the only test harness in the repository. lib/records.ts imports nothing, so
 * it runs under Node without a DOM. App.tsx builds its routes and redirects
 * from this module and the Sidebar decides when Records is lit from it — so
 * pinning it here pins what bookmarks and links actually resolve to.
 */

describe("Records tabs", () => {
  it("are Accounts, Clients, Cases — in that order", () => {
    expect([...RECORDS_TABS]).toEqual(["accounts", "clients", "cases"]);
    expect(RECORDS_TABS.map((t) => RECORDS_TAB_LABELS[t])).toEqual(["Accounts", "Clients", "Cases"]);
  });

  it("put the tab in the path, so a refresh or bookmark reopens it", () => {
    expect(recordsPath("accounts")).toBe("/records/accounts");
    expect(recordsPath("clients")).toBe("/records/clients");
    expect(recordsPath("cases")).toBe("/records/cases");
  });

  it("open on the first tab when none is given", () => {
    expect(DEFAULT_RECORDS_TAB).toBe("accounts");
    expect(recordsPath()).toBe("/records/accounts");
  });

  it("accept only the three real tab names", () => {
    for (const t of RECORDS_TABS) expect(isRecordsTab(t)).toBe(true);
    for (const bad of ["", "Accounts", "CASES", "records", "contacts", "cases/5", undefined, null, 3, {}]) {
      expect(isRecordsTab(bad)).toBe(false);
    }
  });
});

describe("old list URLs", () => {
  const byFrom = Object.fromEntries(LEGACY_LIST_ROUTES);

  it("each open the matching Records tab", () => {
    expect(byFrom).toEqual({
      "/accounts": "accounts",
      "/clients": "clients",
      "/contacts": "clients",
      "/customers": "clients",
      "/cases": "cases",
    });
  });

  it("all redirect to a real tab", () => {
    for (const [, tab] of LEGACY_LIST_ROUTES) expect(isRecordsTab(tab)).toBe(true);
  });

  it("never include a detail URL, so individual record pages keep working", () => {
    for (const [from] of LEGACY_LIST_ROUTES) {
      expect(from).not.toContain(":");
      expect(from.split("/").filter(Boolean)).toHaveLength(1);
    }
    for (const detail of ["/accounts/1", "/clients/2", "/contacts/3", "/cases/4"]) {
      expect(LEGACY_LIST_ROUTES.some(([from]) => from === detail)).toBe(false);
    }
  });

  it("are listed once each", () => {
    const froms = LEGACY_LIST_ROUTES.map(([from]) => from);
    expect(new Set(froms).size).toBe(froms.length);
  });
});

describe("when the Records sidebar entry is lit", () => {
  it("on the workspace and every tab", () => {
    expect(isRecordsLocation(RECORDS_BASE)).toBe(true);
    for (const t of RECORDS_TABS) expect(isRecordsLocation(recordsPath(t))).toBe(true);
  });

  it("on the old list URLs, before their redirect lands", () => {
    for (const [from] of LEGACY_LIST_ROUTES) expect(isRecordsLocation(from)).toBe(true);
  });

  it("on individual Account, Client and Case pages", () => {
    for (const p of ["/accounts/7", "/clients/3", "/contacts/3", "/cases/12"]) {
      expect(isRecordsLocation(p)).toBe(true);
    }
  });

  it("nowhere else", () => {
    for (const p of [
      "/", "/leads", "/accounting", "/insights", "/settings", "/messages", "/workflow",
      "/recordsx", "/records-old", "/casesx", "/accountsx",
    ]) {
      expect(isRecordsLocation(p)).toBe(false);
    }
  });
});
